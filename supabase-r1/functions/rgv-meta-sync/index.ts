import postgres from "npm:postgres@3.4.4";
const ACCOUNTS=["696363384474339","171474008015977"], START="2026-01-01";
const day=(d:Date)=>d.toISOString().slice(0,10);
const advance=(s:string,n:number)=>day(new Date(Date.parse(s+"T12:00:00Z")+n*86400000));
Deno.serve(async(req)=>{
const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:1});
const send=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}});
let id:string|undefined,cp:any={},count=0;const lease=crypto.randomUUID(),deadline=Date.now()+70000;
try{
if(req.method!=="POST")return send({error:"method_not_allowed"},405);
const [key]=await sql`select decrypted_secret as s from vault.decrypted_secrets where name='rgv_sync_key'`;
if(!key?.s||req.headers.get("x-rgv-sync-key")!==key.s)return send({error:"unauthorized"},403);
const [cfg]=await sql`update rgv.sync_config set checkpoint=coalesce(checkpoint,'{}'::jsonb)||jsonb_build_object('lease_id',${lease}::text,'lease_until',now()+interval '3 minutes') where tool='meta' and enabled and (checkpoint->>'lease_until' is null or (checkpoint->>'lease_until')::timestamptz<now()) returning *`;
if(!cfg)return send({status:"busy_or_disabled"});
cp=cfg.checkpoint;cp.day=cp.day||cp.start_day||START;
cp.account_index=cp.account_index||0;
let ACCOUNT=ACCOUNTS[cp.account_index];
if(!ACCOUNT)return send({status:"success",historical_done:true});
const end=cp.end_day||advance(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),-1);
const [run]=await sql`insert into rgv.sync_run(tool,source,status,started_at) values('meta','manual','running',now()) returning id`;id=run.id;
const token=Deno.env.get("META_TOKEN_API");if(!token)throw new Error("meta_token_missing");
const api=async(path:string,params:Record<string,string>)=>{
const url=new URL("https://graph.facebook.com/v24.0/"+path);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
const r=await fetch(url,{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(20000)}),b=await r.json();
if(!r.ok)throw new Error("meta_error_"+(b.error?.code||r.status));return b;
};
while(Date.now()<deadline-23000&&cp.day<=end){
const until=advance(cp.day,6)>end?end:advance(cp.day,6);
const p:any={level:"ad",time_increment:"1",time_range:JSON.stringify({since:cp.day,until}),fields:"account_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,spend,impressions,inline_link_clicks,reach,actions",limit:"250",use_unified_attribution_setting:"true"};

if(cp.after)p.after=cp.after;
const b=await api("act_"+ACCOUNT+"/insights",p);
if(!Array.isArray(b.data))throw new Error("meta_invalid_response");
await sql.begin(async(tx:any)=>{
const ads:any[]=[],metrics:any[]=[];
for(const r of b.data){
if(r.account_id!==ACCOUNT||r.date_start<START||r.date_start>end)throw new Error("meta_scope_mismatch");
ads.push({account_id:ACCOUNT,ad_id:r.ad_id,campaign_id:r.campaign_id,campaign_name:r.campaign_name,adset_id:r.adset_id,adset_name:r.adset_name,ad_name:r.ad_name,campaign_verified:false,updated_at:new Date().toISOString()});
const actions=r.actions||[],action=(key:string)=>actions.find((a:any)=>a.action_type===key)?.value??null;
metrics.push({account_id:ACCOUNT,ad_id:r.ad_id,day:r.date_start,spend:r.spend??null,impressions:r.impressions??null,link_clicks:r.inline_link_clicks??null,landing_page_views:action("landing_page_view"),pixel_leads:action("offsite_conversion.fb_pixel_lead"),reach_daily:r.reach??null,actions,attribution_setting:"unified_adset",collected_at:new Date().toISOString()});
}
if(ads.length){
const unique=[...new Map(ads.map(r=>[r.ad_id,r])).values()];
await tx`insert into rgv.ad(account_id,ad_id,campaign_id,campaign_name,adset_id,adset_name,ad_name,campaign_verified,updated_at) select account_id,ad_id,campaign_id,campaign_name,adset_id,adset_name,ad_name,campaign_verified,updated_at from jsonb_populate_recordset(null::rgv.ad,${tx.json(unique)}::jsonb) on conflict(account_id,ad_id) do update set campaign_id=excluded.campaign_id,campaign_name=excluded.campaign_name,adset_id=excluded.adset_id,adset_name=excluded.adset_name,ad_name=excluded.ad_name,updated_at=excluded.updated_at`;
await tx`insert into rgv.ad_daily(account_id,ad_id,day,spend,impressions,link_clicks,landing_page_views,pixel_leads,reach_daily,actions,attribution_setting,collected_at) select account_id,ad_id,day,spend,impressions,link_clicks,landing_page_views,pixel_leads,reach_daily,actions,attribution_setting,collected_at from jsonb_populate_recordset(null::rgv.ad_daily,${tx.json(metrics)}::jsonb) on conflict(account_id,ad_id,day) do update set spend=excluded.spend,impressions=excluded.impressions,link_clicks=excluded.link_clicks,landing_page_views=excluded.landing_page_views,pixel_leads=excluded.pixel_leads,reach_daily=excluded.reach_daily,actions=excluded.actions,attribution_setting=excluded.attribution_setting,collected_at=excluded.collected_at`;
}
if(!(b.paging?.next&&b.paging?.cursors?.after)){await tx`insert into rgv.meta_complete_window(account_id,start_day,end_day,completed_at) values(${ACCOUNT},${cp.day}::date,${until}::date,now()) on conflict(account_id,start_day,end_day) do update set completed_at=excluded.completed_at`;}
const next={...cp};if(b.paging?.next&&b.paging?.cursors?.after)next.after=b.paging.cursors.after;else{next.day=advance(until,1);delete next.after}
await tx`update rgv.sync_config set checkpoint=${tx.json(next)},updated_at=now() where tool='meta' and checkpoint->>'lease_id'=${lease}`;cp=next;
});count+=b.data.length;
}
if(cp.day>end){cp.account_index++;cp.day=cp.start_day||START;delete cp.after;}
const complete=cp.account_index>=ACCOUNTS.length;cp.historical_done=complete;
if(complete&&cp.resume_checkpoint){const saved=cp.resume_checkpoint;cp={...saved,lease_id:lease,lease_until:cp.lease_until};cp.historical_done=Boolean(saved.historical_done);}
await sql`update rgv.sync_run set status=${complete?"success":"partial"},finished_at=now(),rows_processed=${count},checkpoint=${sql.json({day:cp.day,end_day:end,historical_done:complete})} where id=${id}::uuid`;
return send({status:complete?"success":"partial",rows:count,account_id:ACCOUNT,next_account_index:cp.account_index,next_day:cp.day,end_day:end,historical_done:complete});
}catch(e){
const code=/^meta_[a-z0-9_]+$/.test((e as Error).message)?(e as Error).message:"meta_worker_failure";
const detail=code==="meta_error_190"?"Token inválido ou expirado. Solução: renovar META_TOKEN_API.":code==="meta_error_4"||code==="meta_error_17"?"Limite da Meta atingido. Solução: aguardar e retomar do ponto salvo.":"Falha na coleta Meta. Solução: verificar código técnico e reduzir intervalo se houver timeout. Ponto salvo preservado.";
if(id)await sql`update rgv.sync_run set status='error',finished_at=now(),rows_processed=${count},error_type=${code},error_detail=${detail} where id=${id}::uuid`;
return send({status:"error",error:code,rows:count,sql_code:/^[A-Z0-9]{5}$/.test(String((e as any).code||""))?(e as any).code:null,error_class:(e as Error).name},500);
}finally{if(cp.lease_id===lease){delete cp.lease_id;delete cp.lease_until;await sql`update rgv.sync_config set checkpoint=${sql.json(cp)},updated_at=now() where tool='meta' and checkpoint->>'lease_id'=${lease}`.catch(()=>{});}await sql.end({timeout:3});}
});