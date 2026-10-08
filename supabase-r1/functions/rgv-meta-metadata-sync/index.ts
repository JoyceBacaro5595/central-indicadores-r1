import postgres from "npm:postgres@3.4.4";
const json=(v:unknown,s=200)=>Response.json(v,{status:s});
const safe=(v:unknown)=>{try{const u=new URL(String(v||""));return ["http:","https:"].includes(u.protocol)?u.href:null}catch{return null}};
const canonical=(v:string)=>{const u=new URL(v);for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||["fbclid","gclid"].includes(k.toLowerCase()))u.searchParams.delete(k);u.hash="";return u.href};
Deno.serve(async req=>{
const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:1,connect_timeout:10,idle_timeout:5});
try{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const [key]=await sql`select decrypted_secret s from vault.decrypted_secrets where name='rgv_sync_key'`;
 if(!key?.s||req.headers.get("x-rgv-sync-key")!==key.s)return json({error:"unauthorized"},403);
 const body=await req.json().catch(()=>({}));
 const ids=await sql`select a.ad_id from rgv.ad a where a.account_id='696363384474339' and strpos(upper(coalesce(a.campaign_name,'')),'[FF]')>0 and exists(select 1 from rgv.ad_daily x where x.account_id=a.account_id and x.ad_id=a.ad_id and x.day between '2026-09-01' and '2026-10-07') and not exists(select 1 from rgv.meta_ad_record r where r.account_id=a.account_id and r.ad_id=a.ad_id and r.collected_at>now()-interval '24 hours') order by a.ad_id limit 50`;
 if(!ids.length)return json({status:"complete",rows:0});
 const url=new URL("https://graph.facebook.com/v24.0/");url.searchParams.set("ids",ids.map(x=>x.ad_id).join(","));url.searchParams.set("fields","id,name,effective_status,campaign{id,effective_status},creative{id,name,thumbnail_url,image_url,object_story_spec,asset_feed_spec,url_tags}");
 const r=await fetch(url,{headers:{Authorization:"Bearer "+Deno.env.get("META_TOKEN_API")},signal:AbortSignal.timeout(25000)});
 const data=await r.json();if(!r.ok||data.error)return json({error:"meta_metadata_error",code:data.error?.code||r.status},502);
 let saved=0,unavailable=0,ambiguous=0;
 await sql.begin(async tx=>{
 for(const id of ids){
  const a=data[id.ad_id];if(!a||a.error){unavailable++;continue}
  const c=a.creative||{},story=c.object_story_spec||{},asset=c.asset_feed_spec||{};
  const candidates=[story.link_data?.link,story.link_data?.call_to_action?.value?.link,story.video_data?.call_to_action?.value?.link,...(story.link_data?.child_attachments||[]).flatMap(x=>[x.link,x.call_to_action?.value?.link]),...(asset.link_urls||[]).map(x=>x.website_url)].map(safe).filter(Boolean) as string[];
  const urls=[...new Set(candidates.map(canonical))];
  const forms=[story.link_data?.call_to_action?.value?.lead_gen_form_id,story.video_data?.call_to_action?.value?.lead_gen_form_id].filter(Boolean);
  const dest=urls.length===1?urls[0]:null;const type=forms.length?"formulario":dest?"pagina":urls.length>1?"ambiguous":null;
  if(urls.length>1)ambiguous++;
  const lpId=forms.length===1?"meta-form:"+forms[0]:dest?"lp:"+dest:null;
  if(lpId)await tx`insert into rgv.landing_page(lp_id,canonical_url,name,verified) values(${lpId},${dest},${forms.length?"Formulário Meta "+forms[0]:dest},true) on conflict(lp_id) do update set canonical_url=excluded.canonical_url,name=excluded.name,verified=true`;
  const payload={...a,_derived:{destination_candidates:urls,form_ids:forms,destination_ambiguous:urls.length>1}};
  await tx`insert into rgv.meta_ad_record(account_id,ad_id,payload) values('696363384474339',${id.ad_id},${tx.json(payload)}) on conflict(account_id,ad_id) do update set payload=excluded.payload,collected_at=now()`;
  await tx`update rgv.ad set creative_id=${c.id||null},creative_name=${c.name||null},preview_url=${safe(c.thumbnail_url)||safe(c.image_url)},destination_url=${dest},lp_id=${forms.length===1?"meta-form:"+forms[0]:dest?"lp:"+dest:null},lp_verified=${forms.length===1||!!dest},campaign_status=${a.campaign?.effective_status||null},ad_status=${a.effective_status||null},destination_type=${type},updated_at=now() where account_id='696363384474339' and ad_id=${id.ad_id}`;
  saved++;
 }
 });
 return json({status:"partial",rows:saved,unavailable,ambiguous});
}catch(e){return json({error:"metadata_worker_failure",sql_code:/^[A-Z0-9]{5}$/.test(String(e.code||""))?e.code:undefined},500)}
finally{await sql.end({timeout:3})}
});