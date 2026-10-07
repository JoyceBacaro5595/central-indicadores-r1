import postgres from "npm:postgres@3.4.4";
Deno.serve(async req=>{
 const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:1});
 const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}});
 try{
 const [k]=await sql`select decrypted_secret as s from vault.decrypted_secrets where name='rgv_sync_key'`;
 const a=req.headers.get("x-rgv-sync-key")||"";
 if(!k?.s||a.length!==k.s.length||a!==k.s)return out({error:"unauthorized"},403);
 const h=Deno.env.get("HUBSPOT_TOKEN"),m=Deno.env.get("META_ADS_TOKEN");
 const result:any={hubspot_token_present:!!h,meta_token_present:!!m};
 if(h){const r=await fetch("https://api.hubapi.com/crm/v3/pipelines/deals",{headers:{Authorization:"Bearer "+h},signal:AbortSignal.timeout(15000)});result.hubspot_status=r.status;if(r.ok){const b=await r.json();result.pipelines=b.results.map((p:any)=>({id:p.id,label:p.label}));}}
 if(m){const u=new URL("https://graph.facebook.com/v24.0/act_696363384474339/campaigns");u.searchParams.set("fields","id,name");u.searchParams.set("limit","100");const r=await fetch(u,{headers:{Authorization:"Bearer "+m},signal:AbortSignal.timeout(15000)});result.meta_status=r.status;const b=await r.json();if(r.ok)result.campaigns=b.data;else result.meta_error_code=b.error?.code;}
 return out(result);
 }catch{return out({error:"preflight_failed"},500)}finally{await sql.end({timeout:3})}
});