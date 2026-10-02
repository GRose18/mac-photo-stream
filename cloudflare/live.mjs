// Signaling only. Screen images travel over a direct WebRTC data channel.
export class LiveRoom {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==='/devices'&&request.method==='GET') {
      const rows=await this.ctx.storage.list({prefix:'device:',limit:10});const now=Date.now();
      return Response.json({devices:[...rows.values()].map(d=>({...d,online:now-d.lastSeen<150000})),serverTime:now},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/heartbeat'&&request.method==='POST') {
      const d=await request.json();
      if(!/^[a-f0-9-]{36}$/.test(d.id||'')||typeof d.name!=='string'||!d.name.trim()||d.name.length>80||typeof d.sharing!=='boolean')return Response.json({error:'Invalid device.'},{status:400});
      if(d.tailscaleIP!==null&&(!/^100\.(?:\d{1,3}\.){2}\d{1,3}$/.test(d.tailscaleIP||'')||d.tailscaleIP.split('.').some(n=>Number(n)>255)||Number(d.tailscaleIP.split('.')[1])<64||Number(d.tailscaleIP.split('.')[1])>127))return Response.json({error:'Invalid Tailscale address.'},{status:400});
      return this.ctx.blockConcurrencyWhile(async()=>{
        const key='device:'+d.id,previous=await this.ctx.storage.get(key),now=Date.now();
        if(previous&&now-previous.lastSeen<45000)return new Response(null,{status:204});
        if(!previous&&(await this.ctx.storage.list({prefix:'device:',limit:10})).size>=10)return Response.json({error:'Device limit reached (10).'}, {status:409});
        const day=new Date(now).toISOString().slice(0,10);let budget=await this.ctx.storage.get('heartbeat-budget');
        if(!budget||budget.day!==day)budget={day,count:0};
        if(budget.count>=16000)return Response.json({error:'Daily device check-in limit reached.'},{status:429});
        budget.count++;
        await this.ctx.storage.put({[key]:{id:d.id,name:d.name.trim(),lastSeen:now,sharing:d.sharing,tailscaleIP:d.tailscaleIP,version:typeof d.version==='string'?d.version.slice(0,16):''},'heartbeat-budget':budget});
        return new Response(null,{status:204});
      });
    }
    const role=request.headers.get('X-Live-Role');
    if(!['source','viewer'].includes(role)||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Invalid connection',{status:400});
    return this.ctx.blockConcurrencyWhile(async()=>{
      const now=Date.now();
      for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment().expires<=now)ws.close(1000,'Session expired');
      const sockets=this.ctx.getWebSockets().filter(ws=>ws.readyState===1);
      if(sockets.some(ws=>ws.deserializeAttachment().role===role))return new Response('This live-view role is already connected',{status:409});
      const day=new Date(now).toISOString().slice(0,10),budget=await this.ctx.storage.get('connections')||{day,count:0};
      if(budget.day!==day){budget.day=day;budget.count=0;}
      if(budget.count>=500)return new Response('Daily live connection limit reached',{status:429});
      budget.count++;await this.ctx.storage.put('connections',budget);
      const pair=new WebSocketPair(),[client,server]=Object.values(pair);
      server.serializeAttachment({role,expires:now+30*60*1000,count:0});this.ctx.acceptWebSocket(server);
      const expiry=Math.min(...this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment().expires));await this.ctx.storage.setAlarm(expiry);
      server.send(JSON.stringify({type:'waiting'}));
      if(sockets.length)for(const ws of [...sockets,server])ws.send(JSON.stringify({type:'peer-ready'}));
      return new Response(null,{status:101,webSocket:client});
    });
  }
  async webSocketMessage(ws,message) {
    const state=ws.deserializeAttachment();
    if(Date.now()>=state.expires||typeof message!=='string'||message.length>20000||++state.count>160){ws.close(1008,'Signaling limit');return;}
    ws.serializeAttachment(state);
    let m;try{m=JSON.parse(message);}catch{ws.close(1008,'Invalid signal');return;}
    const sdpType=state.role==='source'?'offer':'answer';
    if(m.type!==sdpType||typeof m.sdp!=='string'||m.sdp.length>18000){ws.close(1008,'Invalid signal');return;}
    // No generic messages, image payloads or storage of SDP are supported.
    for(const peer of this.ctx.getWebSockets())if(peer!==ws&&peer.readyState===1)peer.send(JSON.stringify({type:m.type,sdp:m.sdp}));
  }
  async webSocketClose(ws) { this.depart(ws); }
  async webSocketError(ws) { this.depart(ws); }
  depart(ws){try{ws.close(1000,'Disconnected');}catch{}for(const peer of this.ctx.getWebSockets())if(peer!==ws&&peer.readyState===1)peer.send(JSON.stringify({type:'peer-left'}));}
  async alarm(){const now=Date.now();let next=Infinity;for(const ws of this.ctx.getWebSockets()){const expiry=ws.deserializeAttachment().expires;if(expiry<=now)this.depart(ws);else next=Math.min(next,expiry);}if(Number.isFinite(next))await this.ctx.storage.setAlarm(next);}
}
