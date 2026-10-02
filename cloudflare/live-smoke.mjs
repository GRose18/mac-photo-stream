import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import assert from 'node:assert/strict';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-09-29',durableObjects:{GALLERY:{className:'Gallery',useSQLite:true},LIVE:{className:'LiveRoom',useSQLite:true}},bindings:{FREE_PLAN_SETUP_VERIFIED:'true',ADMIN_PASSWORD:'test-admin',UPLOAD_TOKEN:'test-source'},outboundService:()=>{throw Error('Unexpected external request');}}));
const admin={Authorization:'Basic '+btoa('admin:test-admin')},source={Authorization:'Bearer test-source'},sockets=[];
function messages(ws){const values=[];ws.addEventListener('message',e=>values.push(JSON.parse(e.data)));return values;}
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out');}
try{
 const beat={id:'00000000-0000-4000-8000-000000000001',name:'Synthetic Mac',sharing:false,tailscaleIP:'100.75.53.57',version:'6.0'};
 assert.equal((await mf.dispatchFetch('https://test/api/devices/heartbeat',{method:'POST',headers:source,body:JSON.stringify(beat)})).status,204);
 let devices=await mf.dispatchFetch('https://test/api/devices',{headers:admin});assert.equal(devices.status,200);const rows=(await devices.json()).devices;assert.equal(rows.length,1);assert.equal(rows[0].online,true);assert.equal(rows[0].name,'Synthetic Mac');
 assert.equal((await mf.dispatchFetch('https://test/api/devices',{headers:source})).status,401);
 for(const path of ['/api/devices','/live','/api/live/viewer','/api/live/source'])assert.equal((await mf.dispatchFetch('https://test'+path)).status,401);
 assert.equal((await mf.dispatchFetch('https://test/api/live/viewer',{headers:{...source,Origin:'https://test',Upgrade:'websocket'}})).status,401);
 assert.equal((await mf.dispatchFetch('https://test/api/live/viewer',{headers:{...admin,Origin:'https://evil.test',Upgrade:'websocket'}})).status,403);
 assert.equal((await mf.dispatchFetch('https://test/api/live/source',{headers:{...source,Origin:'https://test',Upgrade:'websocket'}})).status,403);
 assert.equal((await mf.dispatchFetch('https://test/live',{headers:admin})).status,200);
 let r=await mf.dispatchFetch('https://test/api/live/source',{headers:{...source,Upgrade:'websocket'}});assert.equal(r.status,101);const a=r.webSocket;const am=messages(a);a.accept();sockets.push(a);
 r=await mf.dispatchFetch('https://test/api/live/source',{headers:{...source,Upgrade:'websocket'}});assert.equal(r.status,409);
 r=await mf.dispatchFetch('https://test/api/live/viewer',{headers:{...admin,Origin:'https://test',Upgrade:'websocket'}});assert.equal(r.status,101);const b=r.webSocket;const bm=messages(b);b.accept();sockets.push(b);
 await waitFor(()=>am.some(m=>m.type==='peer-ready'));
 a.send(JSON.stringify({type:'offer',sdp:'synthetic offer'}));await waitFor(()=>bm.some(m=>m.sdp==='synthetic offer'));
 b.send(JSON.stringify({type:'answer',sdp:'synthetic answer'}));await waitFor(()=>am.some(m=>m.sdp==='synthetic answer'));
 let closed=false;a.addEventListener('close',()=>closed=true);a.send(JSON.stringify({type:'frame',data:'forbidden'}));await waitFor(()=>closed);
 console.log('Live signaling: authentication, origin checks, role exclusivity, offer/answer forwarding and frame rejection passed.');
}finally{for(const ws of sockets)try{ws.close();}catch{}await mf.dispose();}
