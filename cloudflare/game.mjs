import { HttpError } from './budget.mjs';
import { handleTrading } from './trading.mjs';
import { galleryRoutes } from './gallery.mjs';

const enc = new TextEncoder();
const reply = (data, status = 200, headers = {}) => Response.json(data, {status, headers: {'Cache-Control':'no-store', ...headers}});
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const hash = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const RARITIES = {common:75, rare:18, epic:6, mythic:1};
export const WHEEL = [10,25,15,50,10,100,20,250];
export const GAME_LIMITS = {members:100, cards:500, invitations:200, requestsPerDay:2500, authPerDay:500};
const DAY = 86400000;
const cookieName = '__Host-sclshi';
const cookie = (v, age=604800) => `${cookieName}=${v}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
async function hmac(secret, data) {
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,enc.encode(data)));
}
export async function equal(a,b) {
 const [x,y]=await Promise.all([hash(String(a)),hash(String(b))]); let n=0;
 for(let i=0;i<x.length;i++) n|=x.charCodeAt(i)^y.charCodeAt(i); return n===0;
}
export async function readSession(request, env, now=Date.now()) {
 try {
  const token=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token) return null;
  const [payload, signature, extra]=token.split('.');
  if(extra || !signature || payload.length>1000 || !await equal(signature,await hmac(env.ADMIN_PASSWORD,payload))) return null;
  const data=JSON.parse(atob(payload));
  if(!data || data.exp<=now || !['admin','member'].includes(data.role)) return null;
  return data;
 } catch {return null;}
}
async function session(user, env, now) {
 const payload=btoa(JSON.stringify({id:user.id,role:user.role,version:user.version||0,exp:now+7*DAY,nonce:randomToken()}));
 return cookie(payload+'.'+await hmac(env.ADMIN_PASSWORD,payload));
}
async function passwordHash(password,salt) {
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256));
}
async function body(request) {
 if(!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415,'Send JSON.');
 if(!request.body) throw new HttpError(400,'Missing request.');
 const reader=request.body.getReader();let size=0,chunks=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new HttpError(413,'Request too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try {const v=JSON.parse(new TextDecoder().decode(bytes));if(!v||Array.isArray(v)||typeof v!=='object')throw Error();return v;}catch{throw new HttpError(400,'Invalid JSON.');}
}
function credentials(data) {
 const username=typeof data.username==='string'?data.username.toLowerCase().trim():'';
 if(!/^[a-z0-9_]{3,24}$/.test(username)) throw new HttpError(400,'Username: 3–24 letters, numbers, or underscores.');
 if(typeof data.password!=='string'||data.password.length<12||data.password.length>128)throw new HttpError(400,'Use a password with 12–128 characters.');
 return username;
}
export function randomInt(n) {
 const ceiling=Math.floor(4294967296/n)*n;let v;
 do {v=crypto.getRandomValues(new Uint32Array(1))[0];}while(v>=ceiling);return v%n;
}
export function chooseCard(cards, rng=randomInt) {
 const groups=Object.entries(RARITIES).map(([rarity,weight])=>({weight,cards:cards.filter(c=>c.active&&c.rarity===rarity&&(rarity!=='mythic'||c.minted===0))})).filter(g=>g.cards.length);
 if(!groups.length)throw new HttpError(409,'No cards are available yet. Your daily pack has not been used.');
 let pick=rng(groups.reduce((n,g)=>n+g.weight,0));
 for(const group of groups){if(pick<group.weight)return group.cards[rng(group.cards.length)];pick-=group.weight;}
}
const publicCard = c => ({id:c.id,title:c.title,rarity:c.rarity,minted:c.minted,active:c.active,captured_at:c.captured_at});

// Called inside the existing fixed Gallery object's serialized request boundary.
export async function handleGame(gallery, request) {
 const {storage:store}=gallery.ctx, env=gallery.env;
 const url=new URL(request.url),path=url.pathname,now=Date.now(),day=new Date(now).toISOString().slice(0,10);
 if(!path.startsWith('/api/game/')&&!path.startsWith('/api/auth/')) return null;
 const usage=await store.get('game:usage');
 const today=usage?.day===day?usage:{day,requests:0,auth:0};
 if(today.requests>=(env.GALLERY_ONLY==='true'?1000:GAME_LIMITS.requestsPerDay))throw new HttpError(429,'Daily game safety limit reached. Try after midnight UTC.');
 today.requests++;
 const authAttempt=['/api/auth/login','/api/auth/signup'].includes(path);
 if(authAttempt){
  if(today.auth>=GAME_LIMITS.authPerDay)throw new HttpError(429,'Daily sign-in safety limit reached.');
  today.auth++;
  // Fixed-size hash buckets bound storage even when attackers rotate IPs.
  const bucket=(request.headers.get('X-Client-Hash')||'unknown').slice(0,2);
  const key='game:throttle:'+bucket, old=await store.get(key);
  const limit=old?.until>now?old:{count:0,until:now+15*60000};
  if(limit.count>=15)throw new HttpError(429,'Too many sign-in attempts. Try again in 15 minutes.');
  limit.count++;await store.put(key,limit);
 }
 await store.put('game:usage',today);
 if(path==='/api/auth/logout'&&request.method==='POST')return reply({ok:true},200,{'Set-Cookie':cookie('signed-out')});
 if(authAttempt&&request.method==='POST'){
  const data=await body(request), username=credentials(data);
  if(path.endsWith('/login')){
   if(username==='admin'&&await equal(data.password,env.ADMIN_PASSWORD))return reply({role:'admin'},200,{'Set-Cookie':await session({id:'admin',role:'admin'},env,now)});
   const user=await store.get('game:user:'+username);
   const computed=await passwordHash(data.password,user?.salt||'sclshi-missing-account');
   if(!user||user.disabled||!await equal(computed,user.password))throw new HttpError(401,'Incorrect username or password.');
   return reply({role:'member'},200,{'Set-Cookie':await session(user,env,now)});
  }
  if(username==='admin')throw new HttpError(400,'Choose a different username.');
  if(typeof data.invite!=='string'||!/^[a-f0-9]{64}$/.test(data.invite))throw new HttpError(403,'A valid invitation is required.');
  const inviteKey='game:invite:'+await hash(data.invite), invitation=await store.get(inviteKey);
  if(!invitation||invitation.used||invitation.revoked||invitation.expires<=now)throw new HttpError(403,'Invitation is invalid, expired, or already used.');
  if(await store.get('game:user:'+username))throw new HttpError(409,'That username is taken.');
  const total=await store.get('game:member-count')||0;
  if(total>=GAME_LIMITS.members)throw new HttpError(409,'This private beta has reached its member limit.');
  const salt=randomToken(),user={id:username,role:'member',salt,password:await passwordHash(data.password,salt),coins:0,version:0,created_at:new Date(now).toISOString()};
  await store.transaction(async tx=>{await tx.put({'game:member-count':total+1,['game:user:'+username]:user,[inviteKey]:{...invitation,used:username}});});
  return reply({role:'member'},201,{'Set-Cookie':await session(user,env,now)});
 }
 let identity=request.headers.get('X-Verified-Admin')==='yes'?{id:'admin',role:'admin'}:await readSession(request,env,now);
 if(!identity)throw new HttpError(401,'Please sign in.');
 let user;
 if(identity.role==='member'){
  user=await store.get('game:user:'+identity.id);
  if(!user||user.disabled||user.version!==identity.version)throw new HttpError(401,'Please sign in again.');
 }
 const galleryResponse=await galleryRoutes(gallery,request,identity,body);
 if(galleryResponse)return galleryResponse;
 if(env.GALLERY_ONLY==='true' && (['/api/game/pack','/api/game/spin','/api/game/collection','/api/game/admin/cards'].includes(path)||path.startsWith('/api/game/trad')||path.startsWith('/api/game/card-image/')))throw new HttpError(410,'The card game has been retired.');
 const tradeResponse = await handleTrading(gallery,request,identity,user,body);
 if(tradeResponse)return tradeResponse;
 const admin=identity.role==='admin';
 if(path.startsWith('/api/game/admin/')&&!admin)throw new HttpError(403,'Admin access required.');
 if(path==='/api/game/me'&&request.method==='GET'){
  if(env.GALLERY_ONLY==='true')return reply({username:identity.id,role:identity.role});
  const cards=[...(await store.list({prefix:'game:card:',limit:GAME_LIMITS.cards})).values()];
  const available=cards.filter(c=>c.active&&(c.rarity!=='mythic'||!c.minted));
  const groups=Object.entries(RARITIES).filter(([r])=>available.some(c=>c.rarity===r));const sum=groups.reduce((s,[,w])=>s+w,0);
  return reply({username:identity.id,role:identity.role,coins:user?.coins||0,packOwned:!!(user?.lastPack && await store.get('game:owned:'+user.id+':'+user.lastPack.card.id)),pack:user?.lastPack?.day===day?user.lastPack:null,spin:user?.lastSpin?.day===day?user.lastSpin:null,available:available.length,odds:groups.map(([rarity,w])=>({rarity,percent:100*w/sum})),wheel:WHEEL,reset_at:new Date(Date.parse(day)+DAY).toISOString(),limits:admin?GAME_LIMITS:undefined});
 }
 if(path==='/api/game/admin/invites'){
  if(request.method==='GET')return reply({invites:[...(await store.list({prefix:'game:invite:',limit:GAME_LIMITS.invitations})).entries()].map(([key,v])=>({id:key.slice(12),...v}))});
  if(request.method==='POST'){
   const data=await body(request),rows=await store.list({prefix:'game:invite:',limit:GAME_LIMITS.invitations});
   // Expired/used invitations no longer grant access; remove their metadata before adding more.
   for(const [key,v] of rows)if(v.used||v.revoked||v.expires<=now)await store.delete(key);
   if((await store.list({prefix:'game:invite:',limit:GAME_LIMITS.invitations})).size>=GAME_LIMITS.invitations)throw new HttpError(409,'Invitation limit reached.');
   const token=randomToken(),id=await hash(token);await store.put('game:invite:'+id,{label:String(data.label||'Guest').slice(0,50),created_at:new Date(now).toISOString(),expires:now+7*DAY});
   return reply({token,id,expires:new Date(now+7*DAY).toISOString()},201);
  }
 }
 if(path==='/api/game/admin/revoke'&&request.method==='POST'){
  const data=await body(request);if(!/^[a-f0-9]{64}$/.test(data.id||''))throw new HttpError(400,'Invalid invitation.');
  const key='game:invite:'+data.id,v=await store.get(key);if(v)await store.put(key,{...v,revoked:true});return reply({ok:true});
 }
 if(path==='/api/game/admin/members'&&request.method==='GET')return reply({members:[...(await store.list({prefix:'game:user:',limit:GAME_LIMITS.members})).values()].map(u=>({username:u.id,coins:u.coins,disabled:!!u.disabled,created_at:u.created_at}))});
 if(path==='/api/game/admin/member'&&request.method==='POST'){
  const data=await body(request);if(!/^[a-z0-9_]{3,24}$/.test(data.username||''))throw new HttpError(400,'Invalid member.');
  const key='game:user:'+data.username,u=await store.get(key);if(!u)throw new HttpError(404,'Member not found.');
  if(typeof data.disabled!=='boolean')throw new HttpError(400,'Choose enabled or disabled.');
  u.disabled=data.disabled;u.version++;await store.put(key,u);return reply({ok:true});
 }
 if(path==='/api/game/admin/cards'){
  if(request.method==='GET')return reply({cards:[...(await store.list({prefix:'game:card:',limit:GAME_LIMITS.cards})).values()].map(publicCard)});
  if(request.method==='POST'){
   const data=await body(request);if(!/^[a-f0-9-]{36}$/.test(data.id||'')||!Object.hasOwn(RARITIES,data.rarity)||typeof data.title!=='string'||!data.title.trim()||data.title.length>64)throw new HttpError(400,'Choose a photo, title (up to 64 characters), and rarity.');
   const photo=await store.get('photo:'+data.id);if(photo?.state!=='ready')throw new HttpError(409,'Photo is not ready.');
   const key='game:card:'+data.id,old=await store.get(key);
   if(old?.minted>0&&(old.rarity!==data.rarity||old.title!==data.title.trim()))throw new HttpError(409,'Issued card titles and rarities cannot change. You can retire the card.');
   if(!old&&(await store.list({prefix:'game:card:',limit:GAME_LIMITS.cards})).size>=GAME_LIMITS.cards)throw new HttpError(409,'Card catalog limit reached.');
   const card={id:data.id,title:data.title.trim(),rarity:data.rarity,active:data.active!==false,minted:old?.minted||0,captured_at:photo.captured_at};
   await store.put(key,card);return reply({card:publicCard(card)},old?200:201);
  }
 }
 if(path==='/api/game/collection'&&request.method==='GET'){
  if(admin)return reply({cards:[],next:null});
  const prefix='game:owned:'+identity.id+':',before=url.searchParams.get('before');
  if(before&&(!before.startsWith(prefix)||before.length>150))throw new HttpError(400,'Invalid cursor.');
  const rows=[...(await store.list({prefix,reverse:true,limit:25,...(before?{end:before}:{})})).entries()];
  const cards=[];for(const [,award] of rows.slice(0,24)){const card=await store.get('game:card:'+award.id);if(card)cards.push({...publicCard(card),...award});}
  return reply({cards,next:rows.length>24?rows[23][0]:null});
 }
 if(['/api/game/pack','/api/game/spin'].includes(path)&&request.method==='POST'){
  if(admin)throw new HttpError(403,'Daily rewards are for member accounts. Use an invitation to create a player account.');
  const pack=path.endsWith('/pack'),key=pack?'lastPack':'lastSpin';
  if(user[key]?.day===day)return reply({...user[key],replayed:true});
  let reward;
  if(pack){
   const cards=[...(await store.list({prefix:'game:card:',limit:GAME_LIMITS.cards})).values()],card=chooseCard(cards);
   card.minted++;
   reward={day,card:{...publicCard(card),serial:card.minted,count:1},claimed_at:new Date(now).toISOString()};
   const ownKey='game:owned:'+user.id+':'+card.id, owned=await store.get(ownKey);
   await store.transaction(async tx=>{
    user.lastPack=reward;
    await tx.put({['game:card:'+card.id]:card,['game:user:'+user.id]:user,[ownKey]:{id:card.id,count:(owned?.count||0)+1,serial:owned?.serial||card.minted,acquired_at:reward.claimed_at}});
   });
  }else{
   const index=randomInt(WHEEL.length),coins=WHEEL[index];
   reward={day,index,coins,balance:user.coins+coins,claimed_at:new Date(now).toISOString()};user.coins+=coins;user.lastSpin=reward;await store.put('game:user:'+user.id,user);
  }
  return reply(reward,201);
 }
 const match=path.match(/^\/api\/game\/card-image\/([a-f0-9-]{36})$/);
 if(match&&request.method==='GET'){
  const id=match[1],card=await store.get('game:card:'+id);
  if(!card||(!admin&&!await store.get('game:owned:'+identity.id+':'+id)))throw new HttpError(404,'Card not found.');
  const response=await gallery.handle(new Request('https://internal/api/images/'+id));
  const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,headers});
 }
 throw new HttpError(404,'Not found.');
}
