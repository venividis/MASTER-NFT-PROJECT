export const SIZE = 9
export type Terrain = "plain" | "wall" | "prism"
export type World = { name: string; terrain: Terrain[] }
export type Match = { world: World; cells: number[]; turn: number; moves: number; scores: number[]; winner: number | null; log: { player: number; cell: number }[] }
export type Manifest = { spec: "awe.cartridge/1"; name: string; version: string; engine: string; entry: string; contentHash?: string; capabilities: string[]; settlement: "server" | "onchain" | "local"; world?: World }
export function defaultWorld(): World {
  return { name: "Prism Relay", terrain: Array.from({ length: 81 }, (_, i) => [12, 15, 29, 33, 47, 51, 65, 68].includes(i) ? "wall" : [8, 22, 40, 58, 72].includes(i) ? "prism" : "plain") }
}
export function neighbors(i: number): number[] { const x = i % SIZE, y = Math.floor(i / SIZE); return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b]) => a >= 0 && a < SIZE && b >= 0 && b < SIZE).map(([a,b]) => b * SIZE + a) }
export function validateWorld(input: unknown): World {
  const w = input as World
  if (!w || typeof w.name !== "string" || !w.name.trim() || w.name.length > 80 || !Array.isArray(w.terrain) || w.terrain.length !== 81 || w.terrain.some(t => !["plain","wall","prism"].includes(t)) || w.terrain[0] !== "plain" || w.terrain[80] !== "plain") throw new Error("World needs 81 valid cells and clear corner starts.")
  const visited = new Set([0]), pending = [0]
  while (pending.length) for (const n of neighbors(pending.pop()!)) if (!visited.has(n) && w.terrain[n] !== "wall") { visited.add(n); pending.push(n) }
  if (!visited.has(80) || visited.size < 30) throw new Error("Connect both starting corners with at least 30 playable cells.")
  return { name: w.name.trim(), terrain: [...w.terrain] }
}
export function initialMatch(world = defaultWorld()): Match { return { world: validateWorld(world), cells: Array.from({length:81},(_,i)=>i===0?1:i===80?2:0), turn:1, moves:0, scores:[1,1], winner:null, log:[] } }
export function legalMoves(m: Match, player = m.turn): number[] { return m.winner !== null ? [] : m.cells.flatMap((v,i) => v === 0 && m.world.terrain[i] !== "wall" && neighbors(i).some(n => m.cells[n] === player) ? [i] : []) }
export function playMove(m: Match, cell: number, player = m.turn): Match {
  if (!Number.isInteger(cell) || m.winner !== null || player !== m.turn || !legalMoves(m,player).includes(cell)) throw new Error("Choose an empty cell touching your territory on your turn.")
  const next: Match = { ...m, cells:[...m.cells], scores:[...m.scores], moves:m.moves+1, turn:3-player, log:[...m.log,{player,cell}] }
  next.cells[cell] = player; next.scores[player-1] += m.world.terrain[cell] === "prism" ? 4 : 1
  if (!legalMoves(next).length) next.turn = player
  if (next.moves >= 36 || !legalMoves(next).length) next.winner = next.scores[0] === next.scores[1] ? 0 : next.scores[0] > next.scores[1] ? 1 : 2
  return next
}
export function botMove(m: Match): number | undefined { return legalMoves(m).sort((a,b) => (m.world.terrain[b] === "prism" ? 100 : 0) - (m.world.terrain[a] === "prism" ? 100 : 0) || Math.abs(a%9-4)+Math.abs(Math.floor(a/9)-4)-Math.abs(b%9-4)-Math.abs(Math.floor(b/9)-4))[0] }
export function validateManifest(input: unknown): Manifest {
  const m = input as Manifest
  if (!m || m.spec !== "awe.cartridge/1" || typeof m.name !== "string" || !m.name.trim() || m.name.length>80 || typeof m.version !== "string" || m.version.length>32 || typeof m.engine !== "string" || m.engine.length>40 || typeof m.entry !== "string" || m.entry.length>2048 || !Array.isArray(m.capabilities) || m.capabilities.length>16 || m.capabilities.some(c=>typeof c!=="string" || c.length>60) || !["server","onchain","local"].includes(m.settlement)) throw new Error("Invalid AWE cartridge manifest.")
  if (m.entry !== "awe:prism-relay" && !m.entry.startsWith("/api/console/files/") && !m.entry.startsWith("/api/console/content/") && !/^https:\/\//.test(m.entry)) throw new Error("Use an HTTPS game entry or a packaged AWE game.")
  if (m.entry.startsWith("/api/console/files/") && !/^\/api\/console\/files\/[a-f0-9-]{36}$/.test(m.entry)) throw new Error("Invalid package entry.")
  if (m.entry.startsWith("/api/console/content/") && !/^\/api\/console\/content\/[a-f0-9]{64}$/.test(m.entry)) throw new Error("Invalid content hash entry.")
  if (m.world) validateWorld(m.world)
  return m
}
export type FeeRoute = { recipient: string; weight: string; outputToken: string }
export function validateRoutes(routes: FeeRoute[]) {
  if (!routes.length || routes.length>32) throw new Error("Use 1–32 routes per router.")
  for (const r of routes) if (!/^0x[a-fA-F0-9]{40}$/.test(r.recipient) || /^0x0{40}$/.test(r.recipient) || !/^[1-9][0-9]{0,17}$/.test(r.weight) || !/^0x[a-fA-F0-9]{40}$/.test(r.outputToken)) throw new Error("Each route needs a recipient, positive integer weight and token address. Zero token address means native currency.")
  if (new Set(routes.map(r=>r.recipient.toLowerCase())).size !== routes.length) throw new Error("Combine duplicate recipients in one route.")
  return routes
}
export function splitUnits(amount: bigint, routes: FeeRoute[]): bigint[] {
  validateRoutes(routes); if(amount < BigInt(0)) throw new Error("Amount cannot be negative.")
  const total = routes.reduce((s,r)=>s+BigInt(r.weight),BigInt(0)); let used=BigInt(0)
  return routes.map((r,i)=>{const n=i===routes.length-1?amount-used:amount*BigInt(r.weight)/total;used+=n;return n})
}
