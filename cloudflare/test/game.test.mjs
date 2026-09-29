import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker, {Gallery} from '../worker.mjs';
import {chooseCard, hash} from '../game.mjs';
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
  gallery.env=env;
  return {storage,bucket,env,call:r=>worker.fetch(r,env)};
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const photo=(n=1,body=new Uint8Array([255,216,255,217]))=>new Request('https://example.test/upload',{method:'POST',headers:{Authorization:'Bearer test-upload','X-Photo-ID':id(n),'X-Captured-At':'2026-09-29T12:00:00Z'},body});
const view=(path,method='GET')=>new Request('https://example.test'+path,{method,headers:{Authorization:'Basic '+btoa('admin:test-admin'),'X-Photo-Action':'delete'}});
const adminHeaders={Authorization:'Basic '+btoa('admin:test-admin')};
function game(f,path,data,headers={}){return f.call(new Request('https://example.test'+path,{method:data===undefined?'GET':'POST',headers:{...headers,...(data===undefined?{}:{'Content-Type':'application/json','X-Sclshi-Action':'1'})},...(data===undefined?{}:{body:JSON.stringify(data)})}));}
async function join(f,username='collector'){
 const invitation=await game(f,'/api/game/admin/invites',{label:'Test'},adminHeaders);assert.equal(invitation.status,201);const {token}=await invitation.json();
 const signup=await game(f,'/api/auth/signup',{invite:token,username,password:'a-strong-test-password'});assert.equal(signup.status,201,await signup.clone().text());
 return {Cookie:signup.headers.get('Set-Cookie').split(';')[0]};
}
async function publish(f,n,rarity='common') {await f.call(photo(n));const r=await game(f,'/api/game/admin/cards',{id:id(n),title:'Moment '+n,rarity},adminHeaders);assert.equal(r.status,201,await r.clone().text());}
test('public shell contains no photos; anonymous APIs remain inaccessible',async()=>{const f=fixture();assert.equal((await f.call(new Request('https://example.test/'))).status,200);assert.equal((await game(f,'/api/game/me')).status,401);assert.equal((await game(f,'/api/game/admin/invites',{}, {'X-Verified-Admin':'yes'})).status,401);});
test('invitation is mandatory, single-use, and expires',async()=>{const f=fixture();const d={username:'alice',password:'a-strong-test-password'};assert.equal((await game(f,'/api/auth/signup',d)).status,403);const i=await(await game(f,'/api/game/admin/invites',{},adminHeaders)).json();const results=await Promise.all(['alice','bobby'].map(username=>game(f,'/api/auth/signup',{...d,username,invite:i.token})));assert.deepEqual(results.map(r=>r.status).sort(),[201,403]);const j=await(await game(f,'/api/game/admin/invites',{},adminHeaders)).json();await f.storage.put('game:invite:'+await hash(j.token),{expires:1});assert.equal((await game(f,'/api/auth/signup',{...d,username:'carol',invite:j.token})).status,403);});
test('member cannot read private uploads, publish cards, or see unowned card images',async()=>{const f=fixture(),cookie=await join(f);await publish(f,1);assert.equal((await f.call(new Request('https://example.test/api/images',{headers:cookie}))).status,401);assert.equal((await game(f,'/api/game/admin/cards',{id:id(1)},cookie)).status,403);assert.equal((await game(f,'/api/game/card-image/'+id(1),undefined,cookie)).status,404);assert.equal(f.bucket.reads,0);});
test('pack double-click and retry award once; next UTC day awards again',async()=>{const f=fixture(),cookie=await join(f);await publish(f,1);const rs=await Promise.all([game(f,'/api/game/pack',{},cookie),game(f,'/api/game/pack',{},cookie)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,201]);assert.equal((await f.storage.get('game:card:'+id(1))).minted,1);const u=await f.storage.get('game:user:collector');u.lastPack.day='2000-01-01';await f.storage.put('game:user:collector',u);assert.equal((await game(f,'/api/game/pack',{},cookie)).status,201);assert.equal((await f.storage.get('game:owned:collector:'+id(1))).count,2);assert.equal((await game(f,'/api/game/card-image/'+id(1),undefined,cookie)).status,200);});
test('mythic has exactly one global owner under concurrent openings',async()=>{const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby');await publish(f,1,'mythic');const rs=await Promise.all([game(f,'/api/game/pack',{},a),game(f,'/api/game/pack',{},b)]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.equal((await f.storage.get('game:card:'+id(1))).minted,1);assert.equal((await f.storage.list({prefix:'game:owned:',limit:10})).size,1);const loser=rs[0].status===409?'alice':'bobby';assert.equal((await f.storage.get('game:user:'+loser)).lastPack,undefined);});
test('spin cannot be replayed for extra coins or client chosen rewards',async()=>{const f=fixture(),cookie=await join(f);const rs=await Promise.all([game(f,'/api/game/spin',{coins:999999,index:7},cookie),game(f,'/api/game/spin',{},cookie)]);const rewards=await Promise.all(rs.map(r=>r.json()));assert.equal(rewards[0].coins,rewards[1].coins);assert.ok(rewards[0].coins<=250);assert.equal((await f.storage.get('game:user:collector')).coins,rewards[0].coins);});
test('issued card identity is immutable, retired cards remain owned, deletion blocked',async()=>{const f=fixture(),cookie=await join(f);await publish(f,1);await game(f,'/api/game/pack',{},cookie);assert.equal((await game(f,'/api/game/admin/cards',{id:id(1),title:'Changed',rarity:'mythic'},adminHeaders)).status,409);assert.equal((await f.call(view('/api/images/'+id(1),'DELETE'))).status,409);assert.equal((await game(f,'/api/game/admin/cards',{id:id(1),title:'Moment 1',rarity:'common',active:false},adminHeaders)).status,200);assert.equal((await game(f,'/api/game/card-image/'+id(1),undefined,cookie)).status,200);});
test('cross-site actions and oversized auth requests are rejected',async()=>{const f=fixture();assert.equal((await game(f,'/api/game/admin/invites',{}, {...adminHeaders,Origin:'https://evil.test'})).status,403);assert.equal((await game(f,'/api/auth/signup',{junk:'x'.repeat(5000)})).status,413);});
test('disabled members and tampered cookies cannot authenticate',async()=>{const f=fixture(),c=await join(f);assert.equal((await game(f,'/api/game/me',undefined,{Cookie:c.Cookie+'bad'})).status,401);await game(f,'/api/game/admin/member',{username:'collector',disabled:true},adminHeaders);assert.equal((await game(f,'/api/game/me',undefined,c)).status,401);assert.equal((await game(f,'/api/auth/login',{username:'collector',password:'a-strong-test-password'})).status,401);});
test('rarity selection removes exhausted mythics and supports all configured groups',()=>{const cards=Object.keys({common:1,rare:1,epic:1,mythic:1}).map((rarity,i)=>({id:i,rarity,active:true,minted:0}));assert.equal(chooseCard(cards,n=>n-1).rarity,'mythic');cards[3].minted=1;assert.equal(chooseCard(cards,n=>n-1).rarity,'epic');assert.throws(()=>chooseCard([]));});
test('signup stores a salted hash and secure cookie; password login works',async()=>{const f=fixture(),c=await join(f);const u=await f.storage.get('game:user:collector');assert.notEqual(u.password,'a-strong-test-password');assert.equal(u.password.length,64);const r=await game(f,'/api/auth/login',{username:'collector',password:'a-strong-test-password'});assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/Secure; HttpOnly; SameSite=Strict/);assert.equal((await game(f,'/api/auth/login',{username:'collector',password:'wrong-password-long'})).status,401);});
test('recreating the worker object preserves ownership and balances',async()=>{const f=fixture(),c=await join(f);await publish(f,1,'mythic');await game(f,'/api/game/pack',{},c);const reward=await(await game(f,'/api/game/spin',{},c)).json();let tail=Promise.resolve();const gallery=new Gallery({storage:f.storage,blockConcurrencyWhile(fn){const next=tail.then(fn);tail=next.catch(()=>{});return next;}},f.env,f.bucket);f.env.GALLERY.get=()=>gallery;const me=await(await game(f,'/api/game/me',undefined,c)).json();assert.equal(me.coins,reward.balance);assert.equal(me.pack.card.rarity,'mythic');assert.equal((await game(f,'/api/game/pack',{},c)).status,200);});
test('revoked invitations cannot enroll',async()=>{const f=fixture(),i=await(await game(f,'/api/game/admin/invites',{},adminHeaders)).json();await game(f,'/api/game/admin/revoke',{id:i.id},adminHeaders);assert.equal((await game(f,'/api/auth/signup',{username:'alice',password:'a-strong-test-password',invite:i.token})).status,403);});

test('member and signed-out cookies override browser-cached Basic admin credentials',async()=>{const f=fixture(),c=await join(f);const member=await(await game(f,'/api/game/me',undefined,{...adminHeaders,...c})).json();assert.equal(member.role,'member');const logout=await game(f,'/api/auth/logout',{},c);const out={Cookie:logout.headers.get('Set-Cookie').split(';')[0]};assert.equal((await game(f,'/api/game/me',undefined,{...adminHeaders,...out})).status,401);assert.equal((await f.call(new Request('https://example.test/api/images',{headers:{...adminHeaders,...c}}))).status,401);});
async function give(f,username,n,count=1,rarity='common'){
 if(!await f.storage.get('game:card:'+id(n)))await publish(f,n,rarity);
 const c=await f.storage.get('game:card:'+id(n));c.minted+=count;await f.storage.put('game:card:'+id(n),c);
 await f.storage.put('game:owned:'+username+':'+id(n),{id:id(n),count,serial:1,acquired_at:new Date().toISOString()});
}
async function offer(f,cookie,a=1,b=2){const r=await game(f,'/api/game/trades',{give:id(a),want:id(b)},cookie);assert.equal(r.status,201,await r.clone().text());return(await r.json()).offer;}
test('trade swaps exactly one copy and preserves mythic uniqueness; retries are harmless',async()=>{
 const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby');await give(f,'alice',1,2);await give(f,'bobby',2,1,'mythic');const t=await offer(f,a);
 const r=await game(f,'/api/game/trades/'+t.id+'/accept',{},b);assert.equal(r.status,200);
 assert.equal((await f.storage.get('game:owned:alice:'+id(1))).count,1);
 assert.equal((await f.storage.get('game:owned:alice:'+id(2))).count,1);
 assert.equal((await f.storage.get('game:owned:bobby:'+id(1))).count,1);
 assert.equal(await f.storage.get('game:owned:bobby:'+id(2)),undefined);
 assert.equal((await f.storage.get('game:card:'+id(2))).minted,1);
 assert.equal((await game(f,'/api/game/trades/'+t.id+'/accept',{},b)).status,200);
 assert.equal((await f.storage.get('game:owned:alice:'+id(1))).count,1);
});
test('simultaneous trade acceptances cannot spend a card twice',async()=>{
 const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby'),c=await join(f,'carol');await give(f,'alice',1,1,'mythic');await give(f,'bobby',2);await give(f,'carol',2);const t=await offer(f,a);
 const rs=await Promise.all([game(f,'/api/game/trades/'+t.id+'/accept',{},b),game(f,'/api/game/trades/'+t.id+'/accept',{},c)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);
 const owners=[...(await f.storage.list({prefix:'game:owned:',limit:100})).values()].filter(c=>c.id===id(1));assert.equal(owners.length,1);assert.equal(owners[0].count,1);
});
test('offers require ownership; only maker can cancel; cannot accept own offer',async()=>{
 const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby');await give(f,'alice',1);await give(f,'bobby',2);
 assert.equal((await game(f,'/api/game/trades',{give:id(1),want:id(2)},b)).status,409);const t=await offer(f,a);
 assert.equal((await game(f,'/api/game/trades/'+t.id+'/cancel',{},b)).status,403);
 assert.equal((await game(f,'/api/game/trades/'+t.id+'/accept',{},a)).status,403);
 assert.equal((await game(f,'/api/game/trades/'+t.id+'/cancel',{},a)).status,200);
 assert.equal((await game(f,'/api/game/trades/'+t.id+'/accept',{},b)).status,409);
});
test('trade transaction rolls back both transfers on storage failure',async()=>{
 const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby');await give(f,'alice',1);await give(f,'bobby',2);const t=await offer(f,a);
 const original=f.storage.put.bind(f.storage);f.storage.put=async(k,v)=>{if(k==='game:owned:alice:'+id(2))throw Error('simulated failure');return original(k,v);};
 assert.equal((await game(f,'/api/game/trades/'+t.id+'/accept',{},b)).status,503);
 assert.equal((await f.storage.get('game:owned:alice:'+id(1))).count,1);assert.equal((await f.storage.get('game:owned:bobby:'+id(2))).count,1);
 assert.equal(await f.storage.get('game:owned:bobby:'+id(1)),undefined);assert.equal((await f.storage.get('game:trades'))[t.id].status,'open');
});
test('offered image is member-visible without exposing other private photos',async()=>{
 const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby');await give(f,'alice',1);await publish(f,2);const t=await offer(f,a);
 assert.equal((await game(f,'/api/game/trade-image/'+t.id)).status,401);
 assert.equal((await game(f,'/api/game/trade-image/'+t.id,undefined,b)).status,200);
 assert.equal((await game(f,'/api/game/card-image/'+id(2),undefined,b)).status,404);
 await game(f,'/api/game/trades/'+t.id+'/cancel',{},a);
 assert.equal((await game(f,'/api/game/trade-image/'+t.id,undefined,b)).status,404);
});
test('trading away the last copy closes conflicting offers',async()=>{
 const f=fixture(),a=await join(f,'alice'),b=await join(f,'bobby');await give(f,'alice',1);await give(f,'bobby',2);await publish(f,3);const first=await offer(f,a),second=await offer(f,a,1,3);
 await game(f,'/api/game/trades/'+first.id+'/accept',{},b);assert.equal((await f.storage.get('game:trades'))[second.id].status,'unavailable');
});
