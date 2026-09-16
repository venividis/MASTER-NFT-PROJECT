export function applyWorldPacket(state, packet) {
  if (packet.type === 'reset') { const {type,...snapshot}=packet; return snapshot; }
  if (packet.type !== 'delta' || !state || packet.previousRevision !== state.revision) throw Error('World revision gap; a fresh regional snapshot is required.');
  const next = structuredClone(state);
  Object.assign(next.world, packet.base);
  for (const [kind, rows] of Object.entries(packet.upsert)) Object.assign(next.world[kind], rows);
  for (const [kind, keys] of Object.entries(packet.remove)) for (const key of keys) delete next.world[kind][key];
  next.revision = packet.revision; next.presence = packet.presence; next.view = packet.view;
  return next;
}

// Fetch streaming supports an Authorization header without placing the bearer
// in a URL. Each reconnect receives a bounded snapshot before contiguous deltas.
export class WorldTransport {
  constructor({url='/stream',getToken,onPacket,onStatus=()=>{},fetcher=fetch}) { Object.assign(this,{url,getToken,onPacket,onStatus,fetcher}); }
  start() { this.stop(); this.abort = new AbortController(); this.run(this.abort.signal); }
  stop() { this.abort?.abort(); clearTimeout(this.retry); }
  async run(signal) {
    while (!signal.aborted && this.getToken()) {
      try {
        const response = await this.fetcher(this.url,{headers:{Authorization:`Bearer ${this.getToken()}`},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal});
        if (response.status === 401) { this.onStatus('Sign in again; session expired.'); return; }
        if (!response.ok || !response.body) throw Error('World stream unavailable. Reconnecting…');
        this.onStatus('World connected.');
        const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='';
        try {
          while (!signal.aborted) {
            const {value,done}=await reader.read(); if(done) break;
            buffer+=decoder.decode(value,{stream:true});
            if(buffer.length>1048576) throw Error('World update exceeded its bounded message limit.');
            let split; while((split=buffer.indexOf('\n\n'))>=0) {
              const frame=buffer.slice(0,split); buffer=buffer.slice(split+2);
              const data=frame.split('\n').find(line=>line.startsWith('data: '));
              if(data) this.onPacket(JSON.parse(data.slice(6)));
            }
          }
        } finally { await reader.cancel().catch(()=>{}); }
      } catch(error) { if(signal.aborted)return; this.onStatus(error.message); }
      await new Promise(resolve=>{ this.retry=setTimeout(resolve,1000); signal.addEventListener('abort',resolve,{once:true}); });
    }
  }
}
