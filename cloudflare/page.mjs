export const HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Photo Stream</title>
<style>body{font:16px system-ui;margin:2rem auto;max-width:1050px;padding:0 1rem;background:#f4f5f4;color:#18342d}button{padding:.6rem;margin:.4rem}#gallery{display:flex;flex-wrap:wrap;gap:1rem}article{background:white;padding:1rem;border-radius:12px}img{width:270px;max-width:100%;display:block}#status{white-space:pre-wrap}</style>
<h1>Private Photo Stream</h1><p>Photos remain until you delete them. Uploads pause at the storage limit.</p><p id="usage"></p><p id="status" role="status"></p><button id="refresh">Refresh</button><button id="newer">Newest</button><button id="older" disabled>Older</button><div id="gallery"></div>
<script>
const gallery=document.getElementById('gallery'), status=document.getElementById('status');let cursor=null,next=null,busy=false,last='';
async function load(){if(busy)return;busy=true;try{
 const r=await fetch('/api/images'+(cursor?'?before='+encodeURIComponent(cursor):''));if(!r.ok)throw Error('Gallery unavailable ('+r.status+').');
 const data=await r.json();next=data.next;document.getElementById('older').disabled=!next;
 const ids=JSON.stringify(data.images.map(p=>p.id));
 if(ids!==last){last=ids;gallery.replaceChildren();for(const p of data.images){
  const card=document.createElement('article'),im=document.createElement('img'),date=document.createElement('p'),del=document.createElement('button');
  im.src=p.data;im.loading='lazy';im.alt='Snapshot';date.textContent=(p.timestamp_kind==='legacy-upload'?'Original upload: ':'Captured: ')+new Date(p.captured_at).toLocaleString();del.textContent='Delete';
  del.onclick=async()=>{if(!confirm('Permanently delete this photo?'))return;del.disabled=true;try{const d=await fetch('/api/images/'+p.id,{method:'DELETE',headers:{'X-Photo-Action':'delete'}});if(!d.ok)throw Error('Delete failed.');last='';await load();}catch(e){status.textContent=e.message;}finally{del.disabled=false;}};
  card.append(im,date,del);gallery.append(card);
 }}
 const u=await fetch('/api/usage');if(u.ok){const x=await u.json();document.getElementById('usage').textContent=(x.totals.bytes/1e9).toFixed(3)+' / 0.8 GB reserved (includes pending uploads)';}
 status.textContent=data.images.length?'':'No photos on this page.';
}catch(e){status.textContent=e.message;}finally{busy=false;}}
document.getElementById('refresh').onclick=load;document.getElementById('newer').onclick=()=>{cursor=null;load();};document.getElementById('older').onclick=()=>{cursor=next;load();};load();setInterval(()=>{if(!document.hidden&&!cursor)load();},60000);
</script></html>`;
