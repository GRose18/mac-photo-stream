import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import assert from 'node:assert/strict';
const objects=new Map();
const mf=new Miniflare(convertV4MiniflareOptions({
 modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-09-29',
 durableObjects:{GALLERY:{className:'Gallery',useSQLite:true}},
 bindings:{FREE_PLAN_SETUP_VERIFIED:'true',ADMIN_PASSWORD:'local-test',UPLOAD_TOKEN:'local-upload',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_local',SUPABASE_BUCKET:'photo-stream-worker'},
 outboundService:async req=>{
  const u=new URL(req.url);if(u.hostname!=='example.supabase.co')return new Response('Unexpected network', {status:500});
  if(req.method==='POST'){objects.set(u.pathname,await req.arrayBuffer());return Response.json({Key:'stored',Id:'test'});}
  if(req.method==='DELETE'){for(const p of (await req.json()).prefixes)objects.delete('/storage/v1/object/photo-stream-worker/'+p);return Response.json([]);}
  const bytes=objects.get(u.pathname.replace('/object/authenticated/','/object/'));
  return bytes?new Response(bytes,{headers:{'Content-Type':'image/jpeg'}}):Response.json({message:'Missing'},{status:404});
 }
}));
const headers={Authorization:'Bearer local-upload','X-Photo-ID':'00000000-0000-4000-8000-000000000001','X-Captured-At':'2026-09-29T12:00:00Z'};
const auth={Authorization:'Basic '+btoa('admin:local-test')};
try{
 const post=()=>mf.dispatchFetch('https://test/upload',{method:'POST',headers,body:new Uint8Array([255,216,255,217])});
 let r=await post();assert.equal(r.status,201,await r.clone().text());assert.equal((await r.json()).stored,true);
 r=await post();assert.equal(r.status,200);
 r=await mf.dispatchFetch('https://test/api/images',{headers:auth});const list=await r.json();assert.equal(list.images.length,1);
 r=await mf.dispatchFetch('https://test'+list.images[0].data,{headers:auth});assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,4);
 r=await mf.dispatchFetch('https://test'+list.images[0].data,{method:'DELETE',headers:{...auth,'X-Photo-Action':'delete'}});assert.equal(r.status,204);
 r=await mf.dispatchFetch('https://test/api/usage',{headers:auth});assert.equal((await r.json()).totals.bytes,0);
 console.log('Cloudflare runtime smoke passed: upload, retry, list, download, delete, quota release.');
}finally{await mf.dispose();}
