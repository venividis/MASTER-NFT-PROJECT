import { initialMatch, playMove, validateWorld, validateManifest, validateRoutes, type Match } from "./console-core"
type Statement = { bind(...v: unknown[]): Statement; first<T>(): Promise<T|null>; all<T>(): Promise<{results:T[]}>; run(): Promise<{meta:{changes:number}}> }
type Database = { prepare(q:string):Statement }
type Bucket = { put(key:string,value:string,options?:unknown):Promise<unknown>; get(key:string):Promise<{body:ReadableStream}|null> }
type Room = { id:string; owner_id:string; state:string; revision:number; seat1:string; seat2:string|null }
const json = (v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"no-store"}})
const digest = async (s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("")
const token = ()=>crypto.randomUUID()+crypto.randomUUID()
function expose(r:Room) { return {id:r.id,state:JSON.parse(r.state),revision:r.revision,ready:!!r.seat2} }
export async function consoleAPI(req:Request, env:{DB:Database;BUCKET:Bucket}):Promise<Response> {
  const url=new URL(req.url), path=url.pathname.slice("/api/console".length), uid=req.headers.get("oai-authenticated-user-id")
  if(!uid) return json({error:"Sign in to save worlds or join a shared match."},401)
  if(req.method!=="GET" && req.headers.get("Origin")!==url.origin) return json({error:"Request origin does not match this console."},403)
  if(!env.DB) return json({error:"Shared storage is not connected yet. Solo play remains available."},503)
  try {
    let body:Record<string,any>={}
    if(req.method==="POST") { if(Number(req.headers.get("content-length")||0)>1100000) return json({error:"Package exceeds 1 MB."},413); const raw=await req.text();if(raw.length>1100000)return json({error:"Package exceeds 1 MB."},413);body=JSON.parse(raw) }
    if(path==="/documents" && req.method==="GET") {
      const rows=await env.DB.prepare("SELECT id, kind, payload, updated_at FROM awe_documents WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 200").bind(uid).all<{id:string;kind:string;payload:string;updated_at:number}>()
      return json({documents:rows.results.map(r=>({...r,payload:JSON.parse(r.payload)}))})
    }
    if(path==="/documents" && req.method==="POST") {
      if(!["world","cartridge","routing","chain","item"].includes(body.kind)) throw new Error("Unknown document type.")
      if(body.kind==="world") validateWorld(body.payload)
      if(body.kind==="cartridge") validateManifest(body.payload)
      if(body.kind==="routing") validateRoutes(body.payload.routes)
      const payload=JSON.stringify(body.payload);if(payload.length>64000)throw new Error("Document too large.")
      const id=typeof body.id==="string"?body.id:crypto.randomUUID();if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new Error("Invalid document identifier.")
      const updated=Date.now()
      const result=await env.DB.prepare("INSERT INTO awe_documents (id, owner_id, kind, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, owner_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at WHERE awe_documents.owner_id=excluded.owner_id AND awe_documents.kind=excluded.kind").bind(id,uid,body.kind,payload,updated).run()
      if(!result.meta.changes) return json({error:"Document belongs to another owner or type."},403)
      return json({id,kind:body.kind,payload:body.payload,updated_at:updated})
    }
    if(path==="/upload" && req.method==="POST") {
      if(!env.BUCKET) return json({error:"Package storage is unavailable."},503)
      if(typeof body.html!=="string" || body.html.length>1000000 || typeof body.name!=="string" || body.name.length>80)throw new Error("Choose a single HTML game up to 1 MB.")
      const id=crypto.randomUUID(), hash=await digest(body.html)
      await env.BUCKET.put("cartridges/"+uid+"/"+id,body.html,{httpMetadata:{contentType:"text/html; charset=utf-8"}})
      return json({entry:"/api/console/files/"+id,contentHash:"sha256:"+hash})
    }
    if(path==="/publish" && req.method==="POST") {
      if(typeof body.id!=="string" || !/^[a-f0-9-]{36}$/.test(body.id))throw new Error("Invalid package.")
      const file=await env.BUCKET.get("cartridges/"+uid+"/"+body.id);if(!file)return json({error:"Package not found."},404)
      const html=await new Response(file.body).text(),hash=await digest(html)
      await env.BUCKET.put("published/"+hash,html,{httpMetadata:{contentType:"text/html; charset=utf-8"}})
      return json({entry:"/api/console/content/"+hash,contentHash:"sha256:"+hash})
    }
    if(path.startsWith("/content/") && req.method==="GET") {
      const hash=path.slice(9);if(!/^[a-f0-9]{64}$/.test(hash))throw new Error("Invalid content hash.")
      const file=await env.BUCKET.get("published/"+hash);if(!file)return json({error:"Published package not found."},404)
      return new Response(file.body,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'","Cache-Control":"private, no-store"}})
    }
    if(path.startsWith("/files/") && req.method==="GET") {
      const id=path.slice(7);if(!/^[a-f0-9-]{36}$/.test(id)) return json({error:"Invalid package."},400)
      const file=await env.BUCKET.get("cartridges/"+uid+"/"+id);if(!file)return json({error:"Package not found in your library."},404)
      return new Response(file.body,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'","X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}})
    }
    if(path==="/rooms" && req.method==="POST") {
      const id=crypto.randomUUID(), secret=token(), state=initialMatch(validateWorld(body.world))
      await env.DB.prepare("INSERT INTO awe_rooms (id, owner_id, state, revision, seat1, seat2, created_at) VALUES (?, ?, ?, 0, ?, NULL, ?)").bind(id,uid,JSON.stringify(state),await digest(secret),Date.now()).run()
      return json({id,state,revision:0,ready:false,seat:1,secret})
    }
    const match=path.match(/^\/rooms\/([a-f0-9-]{36})(?:\/(join|move))?$/)
    if(match) {
      const room=await env.DB.prepare("SELECT * FROM awe_rooms WHERE id = ?").bind(match[1]).first<Room>()
      if(!room)return json({error:"Match not found."},404)
      if(req.method==="GET")return json(expose(room))
      if(match[2]==="join" && req.method==="POST") {
        const secret=token(), result=await env.DB.prepare("UPDATE awe_rooms SET seat2 = ?, revision = revision + 1 WHERE id = ? AND seat2 IS NULL AND revision = ?").bind(await digest(secret),room.id,room.revision).run()
        if(!result.meta.changes)return json({error:"Both seats are occupied. You can watch this match."},409)
        return json({...expose(room),ready:true,revision:room.revision+1,seat:2,secret})
      }
      if(match[2]==="move" && req.method==="POST") {
        if(!room.seat2)throw new Error("Waiting for a second player.")
        const secret=await digest(String(body.secret||"")), player=secret===room.seat1?1:secret===room.seat2?2:0
        if(!player)return json({error:"This session does not control a player."},403)
        if(body.revision!==room.revision)return json({error:"The board changed. Refreshing the match."},409)
        const next=playMove(JSON.parse(room.state) as Match,body.cell,player)
        const result=await env.DB.prepare("UPDATE awe_rooms SET state = ?, revision = revision + 1 WHERE id = ? AND revision = ?").bind(JSON.stringify(next),room.id,room.revision).run()
        if(!result.meta.changes)return json({error:"Another move arrived first. Refreshing the match."},409)
        return json({...expose(room),state:next,revision:room.revision+1})
      }
    }
    return json({error:"Unknown console operation."},404)
  } catch(e) { return json({error:e instanceof Error?e.message:"Console request failed."},400) }
}
