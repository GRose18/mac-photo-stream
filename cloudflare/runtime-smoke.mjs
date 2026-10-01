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
 const action = (path, data, extra={}) => mf.dispatchFetch('https://test'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Sclshi-Action':'1',...extra},body:JSON.stringify(data)});
 r=await action('/api/game/admin/invites',{label:'Runtime test'},auth);assert.equal(r.status,201,await r.clone().text());const invitation=await r.json();
 r=await action('/api/auth/signup',{username:'runtime_player',password:'runtime-test-password',invite:invitation.token});assert.equal(r.status,201,await r.clone().text());
 const member={Cookie:r.headers.get('Set-Cookie').split(';')[0]};
 r=await mf.dispatchFetch('https://test/api/game/me',{headers:member});assert.equal(r.status,200);assert.equal((await r.json()).role,'member');
 r=await action('/api/game/spin',{},member);assert.equal(r.status,201);const spin=await r.json();
 r=await action('/api/game/spin',{},member);assert.equal(r.status,200);assert.equal((await r.json()).balance,spin.balance);
 const cardId='00000000-0000-4000-8000-000000000002';
 r=await mf.dispatchFetch('https://test/upload',{method:'POST',headers:{...headers,'X-Photo-ID':cardId},body:new Uint8Array([255,216,255,217])});assert.equal(r.status,201);
 r=await action('/api/game/admin/cards',{id:cardId,title:'Runtime mythic',rarity:'mythic'},auth);assert.equal(r.status,201);
 r=await action('/api/game/pack',{},member);assert.equal(r.status,201,await r.clone().text());assert.equal((await r.json()).card.serial,1);
 r=await mf.dispatchFetch('https://test/api/game/card-image/'+cardId,{headers:member});assert.equal(r.status,200);
 r=await mf.dispatchFetch('https://test/api/images/'+cardId,{headers:member});assert.equal(r.status,401);
 r=await action('/api/game/admin/invites',{label:'Trade test'},auth);const secondInvite=await r.json();
 r=await action('/api/auth/signup',{username:'runtime_trader',password:'runtime-test-password',invite:secondInvite.token});assert.equal(r.status,201);
 const second={Cookie:r.headers.get('Set-Cookie').split(';')[0]},commonId='00000000-0000-4000-8000-000000000003';
 r=await mf.dispatchFetch('https://test/upload',{method:'POST',headers:{...headers,'X-Photo-ID':commonId},body:new Uint8Array([255,216,255,217])});assert.equal(r.status,201);
 r=await action('/api/game/admin/cards',{id:commonId,title:'Trade common',rarity:'common'},auth);assert.equal(r.status,201);
 r=await action('/api/game/pack',{},second);assert.equal(r.status,201);assert.equal((await r.json()).card.id,commonId);
 r=await action('/api/game/trades',{give:cardId,want:commonId},member);assert.equal(r.status,201);const trade=(await r.json()).offer;
 r=await action('/api/game/trades/'+trade.id+'/accept',{},second);assert.equal(r.status,200,await r.clone().text());
 r=await mf.dispatchFetch('https://test/api/game/collection',{headers:second});const afterTrade=await r.json();assert.equal(afterTrade.cards.length,1);assert.equal(afterTrade.cards[0].id,cardId);assert.equal(afterTrade.cards[0].rarity,'mythic');
 r=await mf.dispatchFetch('https://test/api/game/gallery',{headers:member});assert.equal(r.status,200);assert.equal((await r.json()).images.length,2);
 r=await action('/api/game/gallery/share',{id:commonId,shared:false},auth);assert.equal(r.status,200);
 r=await mf.dispatchFetch('https://test/api/game/gallery/image/'+commonId,{headers:member});assert.equal(r.status,404);
 r=await action('/api/game/gallery/share',{id:commonId,shared:true},auth);assert.equal(r.status,200);
 r=await mf.dispatchFetch('https://test/api/game/gallery/image/'+commonId,{headers:member});assert.equal(r.status,200);
 console.log('Cloudflare runtime smoke passed: uploads, auth, persisted game compatibility, gallery listing, sharing, and private image access.');
}finally{await mf.dispose();}
