// Authoritative, deterministic civilization slice. Currency here is game-only.
export const RULES = Object.freeze({ width: 28, height: 20, tickMs: 250, maxPlayers: 128, maxOrders: 256, inventoryLimit: 9999 });
const RESOURCES = { wood: [[5, 5], [6, 5], [19, 13]], stone: [[7, 5], [20, 13]], ore: [[8, 5], [21, 13]] };
export const RESOURCE_NODES = Object.entries(RESOURCES).flatMap(([item, nodes]) => nodes.map(([x, y]) => ({ item, x, y })));
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const validItem = item => ['wood', 'stone', 'ore', 'blade'].includes(item);
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
export function newWorld(id = 'anima-commons') {
  return { schema: 'anima.shared-world/1', id, tick: 0, sequence: 0, players: {}, towns: {}, orders: {}, nextOrder: 1,
    creatures: { wisp: { id: 'wisp', x: 10, y: 6, hp: 18, respawnAt: 0 } }, resources: {}, events: [] };
}
export function joinWorld(world, identity, name) {
  if (!world.players[identity]) {
    // Characters are durable economic records. Admission limits belong to live
    // server sessions; deleting a character would orphan towns and market goods.
    world.players[identity] = { id: identity, name: String(name || 'Traveller').replace(/[\x00-\x1f<>]/g, '').slice(0, 24), x: 4, y: 5,
      hp: 30, coins: 20, inventory: { wood: 0, stone: 0, ore: 0, blade: 0 }, lastTick: -1, clientSequence: 0, kills: 0, town: null };
  }
  return world.players[identity];
}
export function advanceWorld(world) {
  ++world.tick;
  for (const creature of Object.values(world.creatures)) if (creature.hp <= 0 && world.tick >= creature.respawnAt) creature.hp = 18;
}
export function applyCommand(world, identity, input) {
  const p = world.players[identity];
  if (!p) throw Error('Join before acting.');
  if (!input || !integer(input.sequence, 1, Number.MAX_SAFE_INTEGER) || input.sequence !== p.clientSequence + 1) throw Error('Command sequence must be the next unused number.');
  if (p.lastTick >= world.tick) throw Error('One action per world tick.');
  const q = structuredClone(world), player = q.players[identity];
  const add = (item, n) => { if (player.inventory[item] + n > RULES.inventoryLimit) throw Error('Inventory is full.'); player.inventory[item] += n; };
  const spend = cost => { for (const [item, amount] of Object.entries(cost)) if (player.inventory[item] < amount) throw Error('Gather the recipe materials first.'); for (const [item, amount] of Object.entries(cost)) player.inventory[item] -= amount; };
  let detail;
  switch (input.type) {
    case 'move': {
      if (!integer(input.dx, -1, 1) || !integer(input.dy, -1, 1) || Math.abs(input.dx) + Math.abs(input.dy) !== 1) throw Error('Move exactly one cardinal tile.');
      const x = player.x + input.dx, y = player.y + input.dy;
      if (x < 1 || x >= RULES.width - 1 || y < 1 || y >= RULES.height - 1) throw Error('The world border is solid.');
      player.x = x; player.y = y; detail = `Moved to ${x},${y}`; break;
    }
    case 'gather': {
      const node = RESOURCE_NODES.find(n => n.item === input.item && distance(n, player) <= 1);
      if (!node) throw Error('Stand beside a matching resource.');
      const key = `${node.x},${node.y}`;
      if ((q.resources[key] || 0) > q.tick) throw Error('This resource is regrowing.');
      add(node.item, 1); q.resources[key] = q.tick + 3; detail = `Gathered ${node.item}`; break;
    }
    case 'craft':
      if (input.recipe !== 'blade') throw Error('Unknown recipe.');
      spend({ wood: 2, ore: 1 }); add('blade', 1); detail = 'Crafted a lightblade'; break;
    case 'attack': {
      const c = q.creatures[input.target];
      if (!c || c.hp <= 0 || distance(player, c) > 1) throw Error('Stand beside a living wisp.');
      const damage = player.inventory.blade > 0 ? 9 : 3;
      c.hp = Math.max(0, c.hp - damage); player.hp = Math.max(0, player.hp - 2);
      if (c.hp === 0) { player.coins += 7; ++player.kills; c.respawnAt = q.tick + 40; }
      if (player.hp === 0) { player.x = 4; player.y = 5; player.hp = 30; player.coins = Math.max(0, player.coins - 3); }
      detail = `Struck wisp for ${damage}`; break;
    }
    case 'rest':
      if (distance(player, { x: 4, y: 5 }) > 1 && !Object.values(q.towns).some(t => distance(t, player) <= 1)) throw Error('Rest beside the source or a town.');
      player.hp = Math.min(30, player.hp + 5); detail = 'Rested at a sanctuary'; break;
    case 'found-town': {
      if (player.town || Object.values(q.towns).some(t => distance(t, player) < 4)) throw Error('Choose a site four tiles from another town; one town per identity.');
      const name = String(input.name || '').replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 24);
      if (!name || RESOURCE_NODES.some(n => distance(n, player) === 0)) throw Error('Choose a name and an empty tile.');
      spend({ wood: 3, stone: 2 }); q.towns[identity] = { id: identity, name, x: player.x, y: player.y, founder: identity, treasury: 0 };
      player.town = identity; detail = `Founded ${name}`; break;
    }
    case 'offer': {
      if (!validItem(input.item) || !integer(input.quantity, 1, 999) || !integer(input.price, 1, 10000) || Object.keys(q.orders).length >= RULES.maxOrders) throw Error('Invalid market order.');
      spend({ [input.item]: input.quantity }); const id = String(q.nextOrder++);
      q.orders[id] = { id, seller: identity, item: input.item, quantity: input.quantity, price: input.price };
      detail = `Listed order ${id}; goods are held by the market`; break;
    }
    case 'buy': {
      const order = q.orders[String(input.order)];
      if (!order || order.seller === identity || player.coins < order.price) throw Error('Order unavailable or insufficient coins.');
      add(order.item, order.quantity); player.coins -= order.price; q.players[order.seller].coins += order.price; delete q.orders[order.id];
      detail = `Bought order ${order.id}`; break;
    }
    case 'cancel': {
      const order = q.orders[String(input.order)];
      if (!order || order.seller !== identity) throw Error('Only the seller may cancel.');
      add(order.item, order.quantity); delete q.orders[order.id]; detail = 'Recovered unsold goods'; break;
    }
    default: throw Error('Unknown world command.');
  }
  player.lastTick = q.tick; player.clientSequence = input.sequence; ++q.sequence;
  const event = { sequence: q.sequence, tick: q.tick, player: identity, action: input.type, detail };
  q.events.push(event); q.events = q.events.slice(-48);
  return { world: q, event };
}
