import {HttpError} from './budget.mjs';
const json=v=>Response.json(v,{headers:{'Cache-Control':'no-store'}});
const valid=id=>/^[a-f0-9-]{36}$/.test(id||'');
async function visible(store,id){const override=await store.get('gallery:visibility:'+id);return override===undefined?!!(await store.get('game:card:'+id))?.active:override;}
export async function galleryRoutes(gallery,request,identity,parseBody){
 const url=new URL(request.url),store=gallery.ctx.storage,admin=identity.role==='admin';
 if(!url.pathname.startsWith('/api/game/gallery'))return null;
 if(url.pathname==='/api/game/gallery'&&request.method==='GET'){
  if(admin){const response=await gallery.handle(new Request('https://internal/api/images'+url.search));const data=await response.json();if(!response.ok)throw new HttpError(response.status,data.error);for(const p of data.images)p.shared=await visible(store,p.id);return json(data);}
  // Previously approved cards remain shared; private uploads never become public.
  const cards=await store.list({prefix:'game:card:',limit:500});
  const shares=await store.list({prefix:'gallery:share:',limit:500});
  const ids=new Set([...cards.values()].filter(c=>c.active).map(c=>c.id));for(const s of shares.values())ids.add(s.id);
  const images=[];for(const id of ids){if(!await visible(store,id))continue;const p=await store.get('photo:'+id);if(p?.state==='ready')images.push({id,content_type:p.content_type||'image/jpeg',captured_at:p.captured_at,uploaded_at:p.uploaded_at,data:'/api/game/gallery/image/'+id});}
  images.sort((a,b)=>b.uploaded_at.localeCompare(a.uploaded_at)||b.id.localeCompare(a.id));
  const before=url.searchParams.get('before');const start=before?images.findIndex(p=>p.id===before)+1:0;
  if(before&&!start)throw new HttpError(400,'Page has changed. Refresh the gallery.');
  const page=images.slice(start,start+20);return json({images:page,next:start+20<images.length?page.at(-1).id:null});
 }
 if(url.pathname==='/api/game/gallery/share'&&request.method==='POST'){
  if(!admin)throw new HttpError(403,'Admin access required.');
  const data=await parseBody(request);if(!valid(data.id)||typeof data.shared!=='boolean')throw new HttpError(400,'Choose a photo and sharing status.');
  const p=await store.get('photo:'+data.id);if(p?.state!=='ready')throw new HttpError(404,'Photo not found.');
  if(data.shared&&!await store.get('gallery:share:'+data.id)&&(await store.list({prefix:'gallery:share:',limit:500})).size>=500)throw new HttpError(409,'Shared photo safety limit reached.');
  await store.transaction(async tx=>{await tx.put('gallery:visibility:'+data.id,data.shared);if(data.shared)await tx.put('gallery:share:'+data.id,{id:data.id});else await tx.delete('gallery:share:'+data.id);});return json({ok:true});
 }
 const match=url.pathname.match(/^\/api\/game\/gallery\/image\/([a-f0-9-]{36})$/);
 if(match&&request.method==='GET'){
  if(!admin&&!await visible(store,match[1]))throw new HttpError(404,'Photo not found.');
  const r=await gallery.handle(new Request('https://internal/api/images/'+match[1]));const headers=new Headers(r.headers);headers.set('Cache-Control','private, no-store');return new Response(r.body,{status:r.status,headers});
 }
 throw new HttpError(404,'Not found.');
}
