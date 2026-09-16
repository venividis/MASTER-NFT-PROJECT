# Prism Relay onchain game

An original two-player territory game whose board, rules, moves and result are enforced by an EVM contract. Rendering happens in the browser. This package provides the chain-native execution alternative to a hosted multiplayer room.

The contract has no owner, upgrades, fees, stakes, token minting or automated rewards. A player's blockchain transaction is their move. No server signs or decides the outcome. This package has only been deployed to a local Ganache test network; no public deployment address is supplied.

## Rules

- Board: 9 × 9, row-major indices 0–80; left/right edges do not wrap.
- Terrain: `0` plain, `1` wall, `2` prism.
- Player one starts owning cell 0; player two starts owning cell 80. Both starts must be plain. Each player begins with **1 point**.
- Both corners must connect through at least 30 reachable non-wall cells. Other disconnected regions are allowed and remain unreachable.
- Claim one neutral, non-wall cell touching any of your territory horizontally or vertically.
- A plain claim earns 1 point; a prism claim earns 4.
- Turns alternate, skipping a player who has no legal move.
- End after 36 total claims or when neither player can claim. The higher score wins; equal scores draw.

These rules and starting scores match `console-core.ts` in the AWE client. Initial corner ownership does not count toward the 36 claims.

## Files and reproduction

- `contracts/PrismRelay.sol`: standalone Solidity 0.8.26 source.
- `artifacts/PrismRelay.json`: ABI, deployment bytecode, deployed bytecode and compiler settings.
- `artifacts/PrismRelay.abi.json`: ABI only, suitable for a browser client.
- `artifacts/PrismRelay.bytecode.txt`: deployment bytecode.
- `artifacts/test-results.json`: local integration results after testing.

```sh
npm install
npm run build
npm test
```

The scripts also use the existing `tmp/code-review/node_modules` toolchain when run in this workspace. No network installation is necessary here. Compilation uses optimizer 200 runs, the Shanghai EVM target and no via-IR requirement. The generated runtime is below the 24,576-byte EIP-170 limit.

## Exact API

### `createMatch(uint8[81] terrain) returns (uint256 matchId)`

Creates a waiting match with the caller as player one. Validates the terrain and initializes both corner cells and scores. IDs start at 1. Read the ID from `MatchCreated` in a submitted transaction receipt; do not treat a preflight `eth_call` ID as reserved.

### `joinMatch(uint256 matchId)`

The first address different from player one becomes player two. Activates the match. No joining fees or stake. A match is public to join; there is no invitation reservation in this version.

### `move(uint256 matchId, uint8 cell)`

The current player's address claims a legal cell. The transaction updates the score and turn, then finishes the game if required. Out-of-turn callers, illegal cells and inactive matches revert. The transaction must be sent by the participant address; an account abstraction wallet can participate as that address.

### `getMatch(uint256 matchId) returns (Match)`

Returns one tuple with these named fields, in this order:

| Field | Solidity type | Meaning |
|---|---|---|
| `terrain` | `uint8[81]` | 0 plain / 1 wall / 2 prism |
| `cells` | `uint8[81]` | 0 neutral / 1 player one / 2 player two |
| `players` | `address[2]` | Player one and player two; player two is zero while waiting |
| `scores` | `uint16[2]` | Scores, including 1 point for each starting cell |
| `turn` | `uint8` | 1 or 2; retained on completion, but no further move is permitted |
| `moves` | `uint8` | Number of successful claims |
| `status` | `uint8` enum | 0 waiting / 1 active / 2 finished |
| `winner` | `uint8` | 0 draw **when finished**, or 1/2 winner |

Before completion, `winner` is zero. Convert to the client representation as `status === 2 ? Number(winner) : null`; never display a waiting or active match as a draw. Ethers v6 returns integer values as `bigint`.

### `getLegalMoves(uint256 matchId) returns (uint8[])`

Returns the current player's legal cells in ascending order, or an empty array for a waiting/finished match. Unknown IDs revert.

### Public getters

`SIZE() -> uint8` is 9; `MAX_MOVES() -> uint8` is 36; `nextMatchId() -> uint256` is the next ID to be assigned.

### Events

```solidity
event MatchCreated(uint256 indexed matchId, address indexed creator);
event MatchJoined(uint256 indexed matchId, address indexed playerTwo);
event CellClaimed(uint256 indexed matchId, uint8 indexed player,
    uint8 cell, uint8 points, uint8 nextTurn, uint8 moves);
event MatchFinished(uint256 indexed matchId, uint8 winner,
    uint16 scoreOne, uint16 scoreTwo);
```

Subscribe to these for responsiveness, then reconcile with `getMatch` after confirmation or reconnection. The full chain-qualified identity is `(chainId, contractAddress, matchId)`.

### Custom errors

`UnknownMatch`, `InvalidTerrain`, `InvalidWorld`, `WrongStatus`, `SamePlayer`, `NotYourTurn`, `IllegalMove`.

## Minimal Ethers client

```js
import { BrowserProvider, Contract } from 'ethers';
import abi from './PrismRelay.abi.json';

const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const game = new Contract(deployedAddress, abi, signer);
const terrain = Array(81).fill(0);
const receipt = await (await game.createMatch(terrain)).wait();
const created = receipt.logs.map(log => {
  try { return game.interface.parseLog(log); } catch { return null; }
}).find(event => event?.name === 'MatchCreated');
const id = created.args.matchId;
// A second participant connects with their own signer and joins.
// await (await gameWithPlayerTwo.joinMatch(id)).wait();
const match = await game.getMatch(id);
```

## Validation and remaining scope

The integration suite deploys the generated bytecode and compares every move against an independent JavaScript rules model, including initial state, participants, legal cells, board ownership, turn, score, terminal status and events. It covers a 36-move draw, prism scoring on the default board, and an exhausted narrow board with skipped turns.

There is no timeout or resignation rule yet: an absent player can leave a match unfinished. Every claim requires a transaction and its chain's gas payment; batching, sponsorship and session wallets are separate adapters. This package does not automatically turn match results into transferable items. A later creator-defined reward adapter must explicitly consume the finished match and prevent duplicate claims without delegating the outcome to a server.
