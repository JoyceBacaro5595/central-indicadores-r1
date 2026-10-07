import postgres from "npm:postgres@3.4.4";

const START_AT = "2026-10-08T00:00:00-03:00";
const PIPELINES = ["749390743", "746355509"];
const BASE = ["dealname", "pipeline", "dealstage", "createdate", "hs_lastmodifieddate", "amount"];
const labels: Record<string,string[]> = {
  product:["Produto"], sale_at:["Data da venda"], origin:["Origem dos Negócios"],
  utm_source:["UTM SOURCE"], utm_medium:["UTM MEDIUM"], utm_campaign:["UTM CAMPAIGN"],
  utm_content:["UTM CONTENT"], utm_term:["UTM TERM"],
  monthly_revenue_raw:["Faturamento mensal"], employee_count_raw:["Número de funcionários"],
};
const normalize=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
const iso=(v:unknown)=> {if(v==null||v==="")return null;const d=new Date(/^\d{10,}$/.test(String(v))?Number(v):String(v));if(!Number.isFinite(d.getTime()))throw new Error("invalid_provider_timestamp");return d.toISOString()};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
class Budget extends Error {}

Deno.serve(async req=>{
  const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:1,idle_timeout:5,connect_timeout:10});
  const begin=Date.now(),lease=crypto.randomUUID();let run:string|undefined,batch:string|undefined,cp:any={},rows=0;
  let stage="auth";let deadline=begin+80000;
  const budget=()=>{if(Date.now()>deadline-4000)throw new Budget("execution_budget")};
  const api=async(path:string,body?:unknown):Promise<any>=>{
    for(let retry=0;retry<4;retry++){
      budget();const token=Deno.env.get("HUBSPOT_TOKEN");if(!token)throw new Error("HUBSPOT_TOKEN_missing");
      const r=await fetch("https://api.hubapi.com"+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(Math.min(15000,Math.max(1000,deadline-Date.now()-3000)))});
      if(r.status===429||r.status>=500){if(retry===3)throw new Error("hubspot_http_"+r.status);const wait=Math.min(8000,Math.max(1000,Number(r.headers.get("retry-after")||2)*1000));await new Promise(r=>setTimeout(r,wait));continue}
      if(!r.ok){const detail=await r.json().catch(()=>({}));const err:any=new Error("hubspot_http_"+r.status);err.provider_category=String(detail.category||"").replace(/[^A-Z_]/g,"").slice(0,80);err.provider_message=/maximum number of inputs supported.*50/i.test(String(detail.message||""))?"history_batch_limit_50":undefined;throw err;}
      const data=await r.json();if(data.status==="PENDING")throw new Error("hubspot_batch_pending");return data;
    }
    throw new Error("hubspot_retry_limit");
  };
  const checkpoint=()=>sql`update rgv.sync_config set checkpoint=${sql.json(cp)},updated_at=now() where tool='hubspot' and checkpoint->>'lease_id'=${lease}`;
  try{
    if(req.method!=="POST")return json({error:"method_not_allowed"},405);
    const supplied=req.headers.get("x-rgv-sync-key")||"";
    const [key]=await sql`select decrypted_secret as s from vault.decrypted_secrets where name='rgv_sync_key'`;
    if(!key?.s||supplied.length!==key.s.length||supplied!==key.s)return json({error:"unauthorized"},403);
    const body=await req.json().catch(()=>({}));
    const [initial]=await sql`select * from rgv.sync_config where tool='hubspot'`;
    if(!initial)throw new Error("hubspot_config_missing");
    if(body.mode!=="check"&&(!initial.enabled||(body.source!=="manual"&&Date.now()<Date.parse(initial.checkpoint?.start_at||START_AT))))return json({status:"scheduled",start_at:initial.checkpoint?.start_at||START_AT});
    if(body.mode!=="check"){
      const acquired=await sql`update rgv.sync_config set checkpoint=coalesce(checkpoint,'{}'::jsonb)||jsonb_build_object('lease_id',${lease}::text,'lease_until',now()+interval '3 minutes'),updated_at=now() where tool='hubspot' and (checkpoint->>'lease_until' is null or (checkpoint->>'lease_until')::timestamptz<now()) returning *`;
      if(!acquired.length)return json({status:"busy"});
      cp=acquired[0].checkpoint||{};deadline=begin+Math.min(100000,Math.max(10000,Number(acquired[0].timeout_ms)))-7000;
      await sql`update rgv.sync_run set status='timeout',finished_at=now(),error_type='worker_timeout',error_detail='Previous worker exceeded its lease; checkpoint retained' where tool='hubspot' and status='running' and started_at<now()-interval '3 minutes'`;
      const [r]=await sql`insert into rgv.sync_run(tool,source,status,started_at,checkpoint) values ('hubspot',${body.source==="manual"?"manual":"cron"},'running',now(),${sql.json({phase:cp.bootstrap_done||body.phase==="incremental"?"incremental":"history_bootstrap"})}) returning id`;run=r.id;
      const [b]=await sql`insert into rgv.import_batch(source,status) values ('hubspot','running') returning id`;batch=b.id;
    }
    stage="catalog";const properties=await api("/crm/v3/properties/deals");
    const mapping:Record<string,string>={};
    for(const [field,wanted] of Object.entries(labels)){
      const found=properties.results.filter((p:any)=>wanted.some(label=>normalize(label)===normalize(p.label)));
      if(found.length===1)mapping[field]=found[0].name;
    }
    // Fall back only to exact property names known to exist; never infer creative from an audience UTM.
    for(const field of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"]){if(!mapping[field]&&properties.results.some((p:any)=>p.name===field))mapping[field]=field}
    const pipelines=await api("/crm/v3/pipelines/deals");
    const pipelineMap=new Map(pipelines.results.map((p:any)=>[p.id,p]));
    if(PIPELINES.some(id=>!pipelineMap.has(id)))throw new Error("required_pipeline_missing");
    const stageMap=new Map<string,any>();for(const p of pipelines.results)for(const s of p.stages)stageMap.set(s.id,{pipeline:p.id,name:s.label});
    const props=[...new Set([...BASE,...Object.values(mapping)])];
    if(body.mode==="check"){
      const ids=await sql`select deal_id from rgv.deal order by deal_id limit 1`;
      const check=await api("/crm/v3/objects/deals/batch/read",{inputs:ids.map((r:any)=>({id:r.deal_id})),properties:props,propertiesWithHistory:["dealstage","pipeline"]});
      return json({status:"ready",pipelines:PIPELINES,mapped_fields:Object.keys(mapping),sample_records:check.results?.length||0,stage_history_available:Array.isArray(check.results?.[0]?.propertiesWithHistory?.dealstage),start_at:START_AT});
    }
    stage="stage_mapping";for(const id of PIPELINES){const p:any=pipelineMap.get(id);for(const s of p.stages){await sql`insert into rgv.stage_mapping(pipeline_id,stage_id,stage_name) values (${id},${s.id},${s.label}) on conflict(pipeline_id,stage_id) do update set stage_name=excluded.stage_name`}}
    const save=async(result:any[],cursorUpdate:()=>void)=>{
      budget();const ids=result.map(r=>String(r.id));
      const existing=ids.length?await sql`select * from rgv.deal where deal_id=any(${ids}::text[])`:[];
      const old=new Map(existing.map((r:any)=>[r.deal_id,r]));
      const records:any[]=[],events:any[]=[],raw:any[]=[];
      for(const r of result){
        const p=r.properties||{},prev:any=old.get(String(r.id));
        if(!prev&&!PIPELINES.includes(p.pipeline))continue;
        const modified=iso(p.hs_lastmodifieddate||r.updatedAt);
        raw.push({batch_id:batch,record_id:String(r.id),payload:r,source_modified_at:modified});
        if(prev?.source_timezone_verified&&prev?.source_modified_at&&modified&&Date.parse(modified)<new Date(prev.source_modified_at).getTime())continue;
        const hist=(r.propertiesWithHistory?.dealstage||[]).filter((e:any)=>e.value&&e.timestamp).map((e:any)=>({...e,timestamp:iso(e.timestamp)})).sort((a:any,b:any)=>a.timestamp.localeCompare(b.timestamp));
        const unique=[...new Map(hist.map((e:any)=>[e.value+"|"+e.timestamp,e])).values()] as any[];
        const pipeHist=(r.propertiesWithHistory?.pipeline||[]).map((e:any)=>({...e,timestamp:iso(e.timestamp)})).sort((a:any,b:any)=>a.timestamp.localeCompare(b.timestamp));
        for(let i=0;i<unique.length;i++){const e=unique[i];const ph=pipeHist.filter((x:any)=>x.timestamp<=e.timestamp).at(-1);events.push({deal_id:String(r.id),pipeline_id:ph?.value||stageMap.get(e.value)?.pipeline||null,stage_id:e.value,entered_at:e.timestamp,exited_at:unique[i+1]?.timestamp||null,source:"hubspot_api",source_event_id:String(e.sourceId||"")})}
        const rec:any={deal_id:String(r.id),pipeline_id:p.pipeline||null,pipeline_name:(pipelineMap.get(p.pipeline) as any)?.label||prev?.pipeline_name||null,current_stage_id:p.dealstage||null,current_stage_name:stageMap.get(p.dealstage)?.name||null,current_stage_entered_at:unique.filter(e=>e.value===p.dealstage).at(-1)?.timestamp||null,created_at:iso(p.createdate||r.createdAt),modified_at:modified,source_modified_at:modified,amount:p.amount==null||p.amount===""?null:Number(p.amount),source_timezone:"UTC",source_timezone_verified:true,history_complete:Array.isArray(r.propertiesWithHistory?.dealstage),processed_at:new Date().toISOString()};
        if(rec.amount!==null&&!Number.isFinite(rec.amount))throw new Error("invalid_provider_amount");
        for(const field of Object.keys(labels)){const v=mapping[field]?p[mapping[field]]:undefined;rec[field]=v===undefined?(prev?.[field]??null):field==="sale_at"?iso(v):v===""?null:v}
        records.push(rec);
      }
      const next={...cp};cursorUpdate();const updated={...cp};cp=next;
      await sql.begin(async(tx:any)=>{
        stage="raw_upsert";if(raw.length)await tx`insert into rgv.raw_record ${tx(raw,"batch_id","record_id","payload","source_modified_at")} on conflict(batch_id,record_id) do update set payload=excluded.payload,source_modified_at=excluded.source_modified_at,captured_at=now()`;
        stage="deal_upsert";if(records.length){const cols=Object.keys(records[0]);const updates=cols.filter(c=>c!=="deal_id");const columns=cols.map(c=>'"'+c+'"').join(',');
          await tx.unsafe('insert into rgv.deal ('+columns+') select '+columns+' from jsonb_populate_recordset(null::rgv.deal,$1::jsonb) on conflict(deal_id) do update set '+updates.map(c=>'"'+c+'"=excluded."'+c+'"').join(','),[tx.json(records)]);}
        stage="events_upsert";if(events.length)await tx`insert into rgv.stage_event ${tx(events,"deal_id","pipeline_id","stage_id","entered_at","exited_at","source","source_event_id")} on conflict(deal_id,stage_id,entered_at) do update set exited_at=excluded.exited_at,pipeline_id=excluded.pipeline_id`;
        await tx`update rgv.sync_config set checkpoint=${tx.json(updated)},updated_at=now() where tool='hubspot' and checkpoint->>'lease_id'=${lease}`;
      });cp=updated;rows+=records.length;
    };
    while(Date.now()<deadline-8000){
      if(!cp.bootstrap_done&&body.phase!=="incremental"){
        const ids=await sql`select deal_id from rgv.deal where deal_id>${cp.bootstrap_cursor||""} order by deal_id limit 50`;
        if(!ids.length){cp.bootstrap_done=true;delete cp.bootstrap_cursor;await checkpoint();continue}
        const b=await api("/crm/v3/objects/deals/batch/read",{inputs:ids.map((r:any)=>({id:r.deal_id})),properties:props,propertiesWithHistory:["dealstage","pipeline"]});
        if(!Array.isArray(b.results)||b.results.length!==ids.length)throw new Error("hubspot_batch_incomplete_checkpoint_retained");
        await save(b.results,()=>{cp.bootstrap_cursor=ids.at(-1).deal_id});continue;
      }
      if(!cp.delta_from)cp.delta_from=new Date(new Date(initial.watermark||START_AT).getTime()-300000).toISOString();
      if(!cp.delta_to){const from=Date.parse(cp.delta_from),until=Math.min(Date.now()-120000,from+900000);if(until<=from)break;cp.delta_to=new Date(until).toISOString();cp.delta_after=null;await checkpoint()}
      const filters=[{propertyName:"hs_lastmodifieddate",operator:"GTE",value:String(Date.parse(cp.delta_from))},{propertyName:"hs_lastmodifieddate",operator:"LT",value:String(Date.parse(cp.delta_to))},{propertyName:"createdate",operator:"GTE",value:String(Date.parse("2026-01-01T00:00:00-03:00"))}];
      stage="search";const page=await api("/crm/v3/objects/deals/search",{filterGroups:[{filters}],sorts:[{propertyName:"hs_lastmodifieddate",direction:"ASCENDING"}],properties:BASE,limit:50,...(cp.delta_after?{after:cp.delta_after}:{})});
      if(page.total>=10000){const a=Date.parse(cp.delta_from),b=Date.parse(cp.delta_to);if(b-a<=1)throw new Error("hubspot_search_limit_same_timestamp");cp.delta_to=new Date(Math.floor((a+b)/2)).toISOString();cp.delta_after=null;await checkpoint();continue}
      const ids=(page.results||[]).map((r:any)=>({id:String(r.id)}));
      let result:any[]=[];if(ids.length){const b=await api("/crm/v3/objects/deals/batch/read",{inputs:ids,properties:props,propertiesWithHistory:["dealstage","pipeline"]});if(b.results?.length!==ids.length)throw new Error("hubspot_batch_incomplete_checkpoint_retained");result=b.results}
      await save(result,()=>{if(page.paging?.next?.after)cp.delta_after=String(page.paging.next.after);else{cp.delta_from=cp.delta_to;delete cp.delta_to;delete cp.delta_after}});
    }
    const deltaCaughtUp=!cp.delta_to&&Date.parse(cp.delta_from||0)>=Date.now()-300000;
    const caughtUp=!!cp.bootstrap_done&&deltaCaughtUp;
    if(deltaCaughtUp){await sql`update rgv.sync_config set watermark=${cp.delta_from}::timestamptz where tool='hubspot'`;cp.delta_from=new Date(Date.parse(cp.delta_from)-300000).toISOString()}
    await sql`update rgv.sync_run set status=${caughtUp?"success":"partial"},finished_at=now(),rows_processed=${rows},checkpoint=${sql.json({bootstrap_done:!!cp.bootstrap_done,delta_from:cp.delta_from,delta_to:cp.delta_to})} where id=${run}::uuid`;
    await sql`update rgv.import_batch set status='success',loaded_rows=${rows},finished_at=now() where id=${batch}::uuid`;
    return json({status:caughtUp?"success":"partial",rows,bootstrap_done:!!cp.bootstrap_done,incremental_caught_up:deltaCaughtUp});
  }catch(e){const limited=e instanceof Budget;const safe=limited?"execution_budget":/^[a-zA-Z0-9_]+$/.test((e as Error).message)?(e as Error).message:"worker_failure";
    const category=String((e as any).provider_category||"");
    const reason=(e as any).provider_message==="history_batch_limit_50"?"HubSpot permite no máximo 50 negócios por lote com histórico. Ação: reduzir o lote para 50.":limited?"Limite de tempo da execução atingido. Ação: continuar do ponto salvo; não é falha dos dados.":safe==="hubspot_http_429"?"Limite de requisições do HubSpot. Ação: aguardar e reduzir a frequência.":safe==="hubspot_http_401"||safe==="hubspot_http_403"?"Acesso ao HubSpot recusado. Ação: validar token e permissões no servidor.":safe==="hubspot_http_400"?"Requisição rejeitada pelo HubSpot. Ação: verificar limites, filtros e tamanho do lote.":"Falha na etapa indicada. Ação: verificar o código técnico antes de repetir a carga.";
    const detail="Etapa: "+stage+". "+reason+" Categoria: "+(category||"não informada")+". Ponto de retomada preservado.";
    if(run)await sql`update rgv.sync_run set status=${limited?"partial":"error"},finished_at=now(),rows_processed=${rows},error_type=${safe},error_detail=${detail} where id=${run}::uuid`.catch(()=>{});
    if(batch)await sql`update rgv.import_batch set status='partial',loaded_rows=${rows},finished_at=now() where id=${batch}::uuid`.catch(()=>{});
    return json({status:limited?"partial":"error",error:safe,stage,provider_category:(e as any).provider_category,provider_message:(e as any).provider_message,sql_code:/^[A-Z0-9]{5}$/.test(String((e as any).code||""))?(e as any).code:undefined,rows},limited?200:500);
  }finally{
    if(run){delete cp.lease_id;delete cp.lease_until;await sql`update rgv.sync_config set checkpoint=${sql.json(cp)},updated_at=now() where tool='hubspot' and checkpoint->>'lease_id'=${lease}`.catch(()=>{})}
    await sql.end({timeout:3});
  }
});
