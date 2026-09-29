import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker, { Gallery } from '../worker.mjs';
import { LIMITS } from '../budget.mjs';
globalThis.crypto ??= webcrypto;
class Store {
  data = new Map();
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k,v) { if(typeof k==='object') for(const [key,value] of Object.entries(k)) this.data.set(key,structuredClone(value));else this.data.set(k,structuredClone(v)); }
  async delete(k) { this.data.delete(k); }
  async transaction(fn) { const saved=structuredClone(this.data);try{return await fn(this);}catch(e){this.data=saved;throw e;} }
  async list({prefix,reverse,limit,end}) { let rows=[...this.data].filter(([k])=>k.startsWith(prefix)&&(!end||k<end)).sort(([a],[b])=>a.localeCompare(b));if(reverse)rows.reverse();return new Map(rows.slice(0,limit)); }
}
function fixture() {
  const storage=new Store();let tail=Promise.resolve();
  const bucket={data:new Map(),writes:0,reads:0,fail:false,
    async put(k,v){this.writes++;this.data.set(k,v);if(this.fail){this.fail=false;throw Error('ambiguous upload');}},
    async get(k){this.reads++;return this.data.has(k)?{body:this.data.get(k)}:null;},async delete(k){this.data.delete(k);}};
  const state={storage,blockConcurrencyWhile(fn){const next=tail.then(fn);tail=next.catch(()=>{});return next;}};
  const gallery=new Gallery(state,{},bucket);
  const env={FREE_PLAN_SETUP_VERIFIED:'true',UPLOAD_TOKEN:'test-upload',ADMIN_PASSWORD:'test-admin',GALLERY:{idFromName:n=>n,get:()=>gallery}};
  return {storage,bucket,env,call:r=>worker.fetch(r,env)};
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const photo=(n=1,body=new Uint8Array([255,216,255,217]))=>new Request('https://example.test/upload',{method:'POST',headers:{Authorization:'Bearer test-upload','X-Photo-ID':id(n),'X-Captured-At':'2026-09-29T12:00:00Z'},body});
const view=(path,method='GET')=>new Request('https://example.test'+path,{method,headers:{Authorization:'Basic '+btoa('admin:test-admin'),'X-Photo-Action':'delete'}});
test('unauthenticated requests never touch storage or ledger',async()=>{const f=fixture();assert.equal((await f.call(new Request('https://example.test/api/images'))).status,401);assert.equal(f.storage.data.size,0);assert.equal(f.bucket.reads,0);});
test('upload verifies identity, duplicate retry does not reserve or write twice',async()=>{const f=fixture();const r=await f.call(photo());assert.equal(r.status,201);const body=await r.json();assert.equal(body.stored,true);assert.equal(body.sha256.length,64);assert.equal((await f.call(photo())).status,200);assert.equal(f.bucket.writes,1);assert.deepEqual(await f.storage.get('totals'),{bytes:4,objects:1});});
test('different contents cannot reuse an existing ID',async()=>{const f=fixture();await f.call(photo());assert.equal((await f.call(photo(1,new Uint8Array([255,216,255,0,217])))).status,409);assert.equal(f.bucket.writes,1);});
test('ambiguous storage failure keeps reservation and retry uses same object',async()=>{const f=fixture();f.bucket.fail=true;assert.equal((await f.call(photo())).status,503);assert.equal((await f.storage.get('totals')).bytes,4);assert.equal((await f.call(photo())).status,201);assert.equal(f.bucket.data.size,1);assert.equal((await f.storage.get('totals')).bytes,4);assert.equal((await f.storage.get('usage')).writes,2);});
test('simultaneous uploads cannot cross storage ceiling',async()=>{const f=fixture();await f.storage.put('totals',{bytes:LIMITS.bytes-4,objects:0});const responses=await Promise.all([f.call(photo(1)),f.call(photo(2))]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,507]);assert.equal(f.bucket.writes,1);assert.equal((await f.storage.get('totals')).bytes,LIMITS.bytes);});
test('write limit blocks before storage and resets next UTC day',async()=>{const f=fixture();await f.storage.put('usage',{day:new Date().toISOString().slice(0,10),writes:LIMITS.writesPerDay,reads:0});assert.equal((await f.call(photo())).status,429);assert.equal(f.bucket.writes,0);await f.storage.put('usage',{day:'2000-01-01',writes:LIMITS.writesPerDay,reads:0});assert.equal((await f.call(photo())).status,201);});
test('read limit blocks before storage',async()=>{const f=fixture();await f.call(photo());await f.storage.put('usage',{day:new Date().toISOString().slice(0,10),writes:1,reads:LIMITS.readsPerDay});assert.equal((await f.call(view('/api/images/'+id(1)))).status,429);assert.equal(f.bucket.reads,0);});
test('delete frees reservation once and upload retry cannot resurrect it',async()=>{const f=fixture();await f.call(photo());assert.equal((await f.call(view('/api/images/'+id(1),'DELETE'))).status,204);assert.equal((await f.storage.get('totals')).bytes,0);assert.equal((await f.call(view('/api/images/'+id(1),'DELETE'))).status,404);assert.equal((await f.call(photo())).status,410);assert.equal(f.bucket.data.size,0);});
test('oversized and invalid images never touch storage',async()=>{const f=fixture();assert.equal((await f.call(photo(1,new Uint8Array(LIMITS.imageBytes+1)))).status,413);assert.equal((await f.call(photo(2,new Uint8Array([1,2,3,4])))).status,415);assert.equal(f.bucket.writes,0);});
test('pagination uses metadata without listing storage',async()=>{const f=fixture();for(let n=1;n<=23;n++)assert.equal((await f.call(photo(n))).status,201);const page=await (await f.call(view('/api/images'))).json();assert.equal(page.images.length,20);assert.ok(page.next);const older=await (await f.call(view('/api/images?before='+encodeURIComponent(page.next)))).json();assert.equal(older.images.length,3);assert.equal(new Set([...page.images,...older.images].map(p=>p.id)).size,23);assert.equal(f.bucket.reads,0);});

test('unverified free-plan setup disables all endpoints',async()=>{const f=fixture();f.env.FREE_PLAN_SETUP_VERIFIED='false';assert.equal((await f.call(photo())).status,503);assert.equal(f.bucket.writes,0);});
test('transfer budget rejects download before contacting storage',async()=>{const f=fixture();await f.call(photo());await f.storage.put('usage',{day:new Date().toISOString().slice(0,10),writes:1,reads:0,transferBytes:LIMITS.transferBytesPerDay-8195});assert.equal((await f.call(view('/api/images/'+id(1)))).status,429);assert.equal(f.bucket.reads,0);});
test('object limit cannot be bypassed with tiny images',async()=>{const f=fixture();await f.storage.put('totals',{bytes:4,objects:LIMITS.objects});assert.equal((await f.call(photo())).status,507);assert.equal(f.bucket.writes,0);});
test('missing secrets fail closed',async()=>{const f=fixture();delete f.env.ADMIN_PASSWORD;assert.equal((await f.call(photo())).status,503);});
