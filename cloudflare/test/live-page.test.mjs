import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {LIVE_HTML} from '../live-page.mjs';
function page(extra={}){
 const elements=new Map(),sockets=[],timers=new Map();let timerID=0;
 const context={URLSearchParams,document:{getElementById(id){if(!elements.has(id))elements.set(id,{disabled:false,hidden:true,removeAttribute(){}});return elements.get(id);}},location:{host:'gallery.test'},WebSocket:class {constructor(url){this.url=url;sockets.push(this);}close(){this.closed=true;}},setTimeout(fn,delay){timers.set(++timerID,{fn,delay});return timerID;},clearTimeout(id){timers.delete(id);},setInterval(){},addEventListener(){},...extra};
 vm.runInNewContext(LIVE_HTML.match(/<script>([\s\S]*)<\/script>/)[1],context);
 return {elements,sockets,timers};
}
test('live page connects on load and reconnects after a session closes',()=>{
 const p=page();assert.equal(p.sockets.length,1);assert.equal(p.sockets[0].url,'wss://gallery.test/api/live/viewer');
 p.sockets[0].onclose({code:1000});assert.equal(p.timers.size,1);const timer=[...p.timers.values()][0];assert.equal(timer.delay,60000);timer.fn();assert.equal(p.sockets.length,2);
});
test('Disconnect cancels reconnection until Connect is clicked',()=>{
 const p=page();p.sockets[0].onclose({code:1006});p.elements.get('stop').onclick();assert.equal(p.timers.size,0);p.elements.get('start').onclick();assert.equal(p.sockets.length,2);
});
test('policy rejection stops automatic retries',()=>{
 const p=page();p.sockets[0].onclose({code:1008});assert.equal(p.timers.size,0);assert.match(p.elements.get('status').textContent,/Session rejected/);
});
test('repeated failed connections back off to five minutes',()=>{
 const p=page();for(const delay of [60000,120000,240000,300000]){p.sockets.at(-1).onclose({code:1006});const timer=[...p.timers.values()][0];assert.equal(timer.delay,delay);timer.fn();}
});

test('RTP video displays frames and clears on disconnect',async()=>{
 let peer,frameCallback;
 class Peer {
  constructor(){peer=this;this.iceGatheringState='complete';}
  async setRemoteDescription(){}
  async createAnswer(){return {type:'answer',sdp:'test'};}
  async setLocalDescription(value){this.localDescription=value;}
  close(){}
 }
 const p=page({RTCPeerConnection:Peer,MediaStream:class {constructor(tracks){this.tracks=tracks;}}});
 p.sockets[0].onmessage({data:JSON.stringify({type:'offer',sdp:'test'})});
 await new Promise(resolve=>setImmediate(resolve));
 const video=p.elements.get('video');video.play=async()=>{};video.requestVideoFrameCallback=fn=>{frameCallback=fn;};
 peer.ontrack({track:{kind:'video'}});assert.ok(video.srcObject);
 frameCallback();assert.equal(video.hidden,false);assert.match(p.elements.get('status').textContent,/test pattern/);
 p.elements.get('stop').onclick();assert.equal(video.hidden,true);assert.equal(video.srcObject,null);
 frameCallback();assert.equal(video.hidden,true);
});

test('aiortc test page connects to its own source channel',()=>{
 const p=page({location:{host:'gallery.test',search:'?mode=aiortc-test'}});
 assert.equal(p.sockets[0].url,'wss://gallery.test/api/live/viewer?mode=aiortc-test');
});
