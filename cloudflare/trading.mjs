import {HttpError} from './budget.mjs';

const cardSummary = c => ({id:c.id,title:c.title,rarity:c.rarity});
const copyKey = (member,card) => 'game:owned:'+member+':'+card;
const validId = value => /^[a-f0-9-]{36}$/.test(value||'');
const reply = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

function trimHistory(trades) {
 const closed=Object.values(trades).filter(t=>t.status!=='open').sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 for(const t of closed.slice(100))delete trades[t.id];
 return trades;
}
async function transfer(tx,from,to,card,now) {
 const fromKey=copyKey(from,card),toKey=copyKey(to,card);
 const source=await tx.get(fromKey),destination=await tx.get(toKey);
 if(!source||source.count<1)throw new HttpError(409,'A card is no longer available. Nothing was exchanged.');
 if(source.count===1)await tx.delete(fromKey);
 else await tx.put(fromKey,{...source,count:source.count-1});
 await tx.put(toKey,{...source,...destination,id:card,count:(destination?.count||0)+1,acquired_at:destination?.acquired_at||now});
}

// Runs within the Gallery Durable Object's serialized request boundary.
export async function handleTrading(gallery,request,identity,user,parseBody) {
 const url=new URL(request.url),path=url.pathname,store=gallery.ctx.storage;
 if(!path.startsWith('/api/game/trad'))return null;
 if(identity.role!=='member')throw new HttpError(403,'Sign in with a player account to trade.');
 const now=new Date().toISOString(),trades=await store.get('game:trades')||{};
 if(path==='/api/game/trades'&&request.method==='GET'){
  const catalog=[...(await store.list({prefix:'game:card:',limit:500})).values()].map(cardSummary);
  const owned=[...(await store.list({prefix:'game:owned:'+user.id+':',limit:500})).values()];
  return reply({offers:Object.values(trades).filter(t=>t.status==='open').sort((a,b)=>b.created_at.localeCompare(a.created_at)),history:Object.values(trades).filter(t=>t.status!=='open'&&(t.maker===user.id||t.taker===user.id)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)),catalog,owned:owned.map(c=>({id:c.id,count:c.count})),maxOpen:5});
 }
 if(path==='/api/game/trades'&&request.method==='POST'){
  const data=await parseBody(request);
  if(!validId(data.give)||!validId(data.want)||data.give===data.want)throw new HttpError(400,'Choose two different cards.');
  const open=Object.values(trades).filter(t=>t.status==='open');
  if(open.length>=100)throw new HttpError(409,'The trading board is full. Try later.');
  if(open.filter(t=>t.maker===user.id).length>=5)throw new HttpError(409,'You can have five open offers. Cancel one first.');
  if(open.some(t=>t.maker===user.id&&t.give.id===data.give&&t.want.id===data.want))throw new HttpError(409,'You already have this offer open.');
  const owned=await store.get(copyKey(user.id,data.give));
  if(!owned||owned.count<1)throw new HttpError(409,'You do not own that card.');
  const give=await store.get('game:card:'+data.give),want=await store.get('game:card:'+data.want);
  if(!give||!want)throw new HttpError(404,'Card not found.');
  const offer={id:crypto.randomUUID(),maker:user.id,give:cardSummary(give),want:cardSummary(want),status:'open',created_at:now,updated_at:now};
  trades[offer.id]=offer;await store.put('game:trades',trimHistory(trades));return reply({offer},201);
 }
 const action=path.match(/^\/api\/game\/trades\/([a-f0-9-]{36})\/(accept|cancel)$/);
 if(action&&request.method==='POST'){
  const offer=trades[action[1]];
  if(!offer)throw new HttpError(404,'Offer not found.');
  if(action[2]==='cancel'){
   if(offer.maker!==user.id)throw new HttpError(403,'Only the owner can cancel this offer.');
   if(offer.status==='cancelled')return reply({offer});
   if(offer.status!=='open')throw new HttpError(409,'This offer has already closed.');
   offer.status='cancelled';offer.updated_at=now;await store.put('game:trades',trimHistory(trades));return reply({offer});
  }
  if(offer.maker===user.id)throw new HttpError(403,'You cannot accept your own offer.');
  if(offer.status==='completed'&&offer.taker===user.id)return reply({offer,replayed:true});
  if(offer.status!=='open')throw new HttpError(409,'This offer has already closed.');
  const maker=await store.get('game:user:'+offer.maker);
  if(!maker||maker.disabled)throw new HttpError(409,'This player is unavailable.');
  const theirs=await store.get(copyKey(offer.maker,offer.give.id));
  const yours=await store.get(copyKey(user.id,offer.want.id));
  if(!theirs||!yours||theirs.count<1||yours.count<1)throw new HttpError(409,'A card is no longer available. Nothing was exchanged.');
  await store.transaction(async tx=>{
   await transfer(tx,offer.maker,user.id,offer.give.id,now);
   await transfer(tx,user.id,offer.maker,offer.want.id,now);
   offer.status='completed';offer.taker=user.id;offer.updated_at=now;
   // Close other promises for a copy that the maker no longer owns.
   for(const other of Object.values(trades)){
    if(other.status==='open'&&[offer.maker,user.id].includes(other.maker)&&!await tx.get(copyKey(other.maker,other.give.id))){other.status='unavailable';other.updated_at=now;}
   }
   await tx.put('game:trades',trimHistory(trades));
  });
  return reply({offer});
 }
 const image=path.match(/^\/api\/game\/trade-image\/([a-f0-9-]{36})$/);
 if(image&&request.method==='GET'){
  const offer=trades[image[1]];
  if(!offer||(offer.status!=='open'&&offer.maker!==user.id&&offer.taker!==user.id))throw new HttpError(404,'Offer not found.');
  const response=await gallery.handle(new Request('https://internal/api/images/'+offer.give.id));
  const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,headers});
 }
 throw new HttpError(404,'Not found.');
}
