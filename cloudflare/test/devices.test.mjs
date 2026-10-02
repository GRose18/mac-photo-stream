import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from '../worker.mjs';
import {LiveRoom} from '../live.mjs';
globalThis.crypto??=webcrypto;
function setup(){
 const data=new Map();let writes=0,tail=Promise.resolve();
 const storage={async get(k){return structuredClone(data.get(k));},async put(k,v){writes++;if(typeof k==='object')for(const [key,value] of Object.entries(k))data.set(key,structuredClone(value));else data.set(k,structuredClone(v));},async list({prefix,limit}){return new Map([...data].filter(([k])=>k.startsWith(prefix)).slice(0,limit));}};
 const ctx={storage,blockConcurrencyWhile(fn){const p=tail.then(fn);tail=p.catch(()=>{});return p;}};
 const env={FREE_PLAN_SETUP_VERIFIED:'true',ADMIN_PASSWORD:'admin-test',UPLOAD_TOKEN:'upload-test',LIVE:{idFromName:n=>n,get:()=>new LiveRoom(ctx)}};
 return {data,storage,writes:()=>writes,call:(path,options={})=>worker.fetch(new Request('https://gallery.test'+path,options),env)};
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source={Authorization:'Bearer upload-test'},admin={Authorization:'Basic '+btoa('admin:admin-test')};
const payload=(n=1)=>({id:id(n),name:'My Mac',sharing:false,tailscaleIP:'100.75.53.57',version:'6.0'});
const heartbeat=(f,p=payload(),headers=source)=>f.call('/api/devices/heartbeat',{method:'POST',headers,body:JSON.stringify(p)});
test('device presence requires upload authorization; listing requires admin',async()=>{
 const f=setup();assert.equal((await heartbeat(f,payload(),{})).status,401);assert.equal(f.data.size,0);
 assert.equal((await heartbeat(f)).status,204);assert.equal((await f.call('/api/devices',{headers:source})).status,401);assert.equal((await f.call('/api/devices')).status,401);
 const d=await(await f.call('/api/devices',{headers:admin})).json();assert.equal(d.devices.length,1);assert.equal(d.devices[0].online,true);assert.equal(d.devices[0].tailscaleIP,'100.75.53.57');
});
test('server receipt time determines online state, independent of device clock',async()=>{
 const f=setup();await heartbeat(f,{...payload(),lastSeen:0});const row=f.data.get('device:'+id(1));assert.ok(Date.now()-row.lastSeen<1000);
 row.lastSeen=Date.now()-151000;let d=await(await f.call('/api/devices',{headers:admin})).json();assert.equal(d.devices[0].online,false);
 await heartbeat(f);d=await(await f.call('/api/devices',{headers:admin})).json();assert.equal(d.devices[0].online,true);
});
test('rapid repeats are coalesced and device/daily caps protect free usage',async()=>{
 const f=setup();await heartbeat(f);const writes=f.writes();await heartbeat(f);assert.equal(f.writes(),writes);
 for(let n=2;n<=10;n++)assert.equal((await heartbeat(f,payload(n))).status,204);
 assert.equal((await heartbeat(f,payload(11))).status,409);
 f.data.get('device:'+id(1)).lastSeen=0;f.data.get('heartbeat-budget').count=16000;assert.equal((await heartbeat(f)).status,429);
 f.data.get('heartbeat-budget').day='2000-01-01';assert.equal((await heartbeat(f)).status,204);
});
test('invalid heartbeat/address, large body and browser origins are rejected',async()=>{
 const f=setup();for(const ip of ['evil.test','javascript:alert(1)','192.168.1.1','100.128.0.1','100.64.999.1'])assert.equal((await heartbeat(f,{...payload(),tailscaleIP:ip})).status,400);
 assert.equal((await heartbeat(f,{...payload(),name:'x'.repeat(1100)})).status,413);
 assert.equal((await heartbeat(f,payload(),{...source,Origin:'https://evil.test'})).status,403);
 assert.equal((await heartbeat(f,{...payload(),sharing:'yes'})).status,400);assert.equal(f.data.size,0);
});
