// Signaling only. Screen images travel over a direct WebRTC data channel.
export class LiveRoom {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
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
