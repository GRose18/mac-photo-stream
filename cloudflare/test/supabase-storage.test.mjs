import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoStore } from '../supabase-storage.mjs';

test('Supabase adapter uploads, downloads and removes only the private object path', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), options });
    if (options.method === 'POST') return Response.json({ Key: 'photo-stream-worker/photo.jpg', Id: 'test' });
    if (options.method === 'DELETE') return Response.json([{ name: 'photo.jpg' }]);
    return new Response(new Uint8Array([255,216,255,217]), {headers:{'Content-Type':'image/jpeg'}});
  };
  try {
    const store = createPhotoStore({SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'sb_secret_test', SUPABASE_BUCKET:'photo-stream-worker'});
    await store.put('photo', new Uint8Array([255,216,255,217]).buffer);
    const result = await store.get('photo');
    assert.equal((await new Response(result.body).arrayBuffer()).byteLength,4);
    await store.delete('photo');
    assert.equal(calls.length,3);
    assert.match(calls[0].url,/\/storage\/v1\/object\/photo-stream-worker\/photo.jpg$/);
    assert.equal(new Headers(calls[0].options.headers).get('x-upsert'),'true');
    assert.equal(new Headers(calls[0].options.headers).get('apikey'),'sb_secret_test');
    assert.equal(calls[2].options.method,'DELETE');
    assert.deepEqual(JSON.parse(calls[2].options.body),{prefixes:['photo.jpg']});
  } finally { globalThis.fetch=original; }
});
test('Supabase errors propagate instead of producing a false upload receipt',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({message:'Quota reached'}, {status:503});
  try {const store=createPhotoStore({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_BUCKET:'photo-stream-worker'});await assert.rejects(()=>store.put('photo',new Uint8Array([255,216,255,217]).buffer));}
  finally{globalThis.fetch=original;}
});
test('video support preserves private bucket limits and uses MP4 paths for its lifecycle',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(input,options)=>{const url=String(input);calls.push({url,options});if(url.endsWith('/bucket/photo-stream-worker'))return Response.json(options.method==='PUT'?{}:{public:false,file_size_limit:1000000,allowed_mime_types:['image/jpeg']});if(options.method==='POST'||options.method==='DELETE')return Response.json({});return new Response('video');};
 try{const store=createPhotoStore({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_BUCKET:'photo-stream-worker'});await store.put('clip',new Uint8Array([0,1]),'video/mp4');await store.get('clip','video/mp4');await store.delete('clip','video/mp4');
 const update=calls.find(c=>c.options.method==='PUT');const body=JSON.parse(update.options.body);assert.equal(body.public,false);assert.equal(body.file_size_limit,1000000);assert.deepEqual(body.allowed_mime_types,['image/jpeg','video/mp4']);assert.match(calls[2].url,/clip.mp4$/);assert.deepEqual(JSON.parse(calls.at(-1).options.body),{prefixes:['clip.mp4']});
 }finally{globalThis.fetch=original;}
});
