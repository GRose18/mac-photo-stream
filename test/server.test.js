const { test } = require('node:test');
const assert = require('node:assert/strict');
const createApp = require('../server');

test('upload, timestamps, paginated reads, authorization and storage failures', async () => {
    const rows = []; let failed = false; let sequence = 0;
    const store = {
        async add(buffer, type, captured_at) { if (failed) throw new Error('private backend details'); const row = {id:++sequence, captured_at, uploaded_at:new Date().toISOString(), data:'https://example.com/image.jpg'}; rows.push(row); return row; },
        async list(before) { const page=rows.filter(x=>!before||x.id<Number(before)).slice().reverse();return {images:page.slice(0,50),next:page.length>50?String(page[49].id):null}; },
        async remove(id) { const index=rows.findIndex(x=>String(x.id)===id);if(index<0)return false;rows.splice(index,1);return true; }
    };
    const server = createApp({store,adminPassword:'test-password'}).listen(0,'127.0.0.1');
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const base = `http://127.0.0.1:${server.address().port}`;
    async function upload(content=Buffer.from([255,216,255,0]),time) { const form=new FormData();form.append('image',new Blob([content],{type:'image/jpeg'}),'photo.jpg');if(time)form.append('captured_at',time);return fetch(base+'/upload',{method:'POST',body:form}); }
    try {
        assert.equal((await upload(Buffer.from('not an image'))).status,415);
        assert.equal((await upload(undefined,'nonsense')).status,400);
        let res=await upload(undefined,'2026-09-28T10:00:00Z');assert.equal(res.status,201);assert.equal((await res.json()).captured_at,'2026-09-28T10:00:00.000Z');
        for(let i=0;i<50;i++)assert.equal((await upload()).status,201);
        res=await fetch(base+'/api/images'); assert.equal((await res.json()).length,50); const cursor=res.headers.get('x-next-cursor');assert(cursor);
        assert.equal((await (await fetch(base+'/api/images?before='+cursor)).json()).length,1);
        assert.equal((await fetch(base+'/api/images?before=invalid')).status,400);
        assert.equal((await fetch(base+'/api/images/1',{method:'DELETE'})).status,401);
        assert.equal(rows.length,51);
        const auth={Authorization:'Bearer test-password'};
        assert.equal((await fetch(base+'/api/images/1',{method:'DELETE',headers:auth})).status,204);
        assert.equal((await fetch(base+'/api/images/1',{method:'DELETE',headers:auth})).status,404);
        assert.equal(rows.length,50);
        failed=true;res=await upload();assert.equal(res.status,503);assert(!(await res.text()).includes('private backend details'));
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
