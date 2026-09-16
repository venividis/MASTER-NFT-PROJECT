// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Web} from "../src/lib/Web.sol";
import {LibNum} from "../src/lib/LibNum.sol";
import {SSTORE2} from "../src/lib/SSTORE2.sol";

interface IHubMin {
    function ownerOf(uint256 id) external view returns (address);
}

/*  STALL — a per-token shop, deployed as an ERC-6551 account at a third
    salt, so its ADDRESS is a function of the token id and therefore its
    HOSTNAME under web3:// is too. Measured, not proposed.               */
contract Stall {
    using LibNum for uint256;

    struct KeyValue { string key; string value; }

    struct Item {
        uint128 price;      // wei
        uint32  stock;
        uint32  shipDays;
        address ptr;        // SSTORE2 shard: the name, plain text, holder-authored
    }

    struct Order {
        address buyer;
        uint96  paid;
        uint32  sku;
        uint32  qty;
        uint64  placed;
        uint8   state;      // 0 open 1 shipped 2 refunded 3 settled
        bytes32 contact;    // commitment ONLY: keccak(address ‖ salt). No PII on chain.
    }

    uint256 private constant WINDOW = 30 days;

    Item[]  private _items;
    Order[] private _orders;
    uint256 private _escrow;

    IHubMin public immutable HUB;
    string  private constant CSP =
        "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

    error NotHolder();
    error NoStock();
    error BadPay();
    error NotOpen();
    error TooSoon();

    constructor(address hub) { HUB = IHubMin(hub); }

    /*  ERC-6551 footer: the last 0x60 bytes of this proxy's runtime are
        (salt, chainId, tokenContract, tokenId).                          */
    function token() public view returns (uint256 chainId, address coll, uint256 id) {
        assembly ("memory-safe") {
            let m := mload(0x40)
            let s := sub(extcodesize(address()), 0x60)
            extcodecopy(address(), m, s, 0x60)
            chainId := mload(m)
            coll    := mload(add(m, 0x20))
            id      := mload(add(m, 0x40))
        }
    }

    function _holder() internal view returns (address) {
        (, , uint256 id) = token();
        return HUB.ownerOf(id);
    }

    modifier onlyHolder() { if (msg.sender != _holder()) revert NotHolder(); _; }

    /*───────── the seller's side ─────────*/

    function list(bytes calldata name, uint128 price, uint32 stock, uint32 shipDays)
        external onlyHolder returns (uint256 sku)
    {
        sku = _items.length;
        _items.push(Item(price, stock, shipDays, SSTORE2.write(name)));
    }

    function restock(uint256 sku, uint32 stock, uint128 price) external onlyHolder {
        _items[sku].stock = stock;
        _items[sku].price = price;
    }

    /*───────── the buyer's side ─────────*/

    /// @param contact keccak256 of wherever the buyer wants to be reached,
    ///        salted by the buyer. The chain stores the commitment; the
    ///        address itself travels off chain and can be forgotten.
    function buy(uint256 sku, uint32 qty, bytes32 contact) external payable returns (uint256 n) {
        Item storage it = _items[sku];
        if (it.stock < qty) revert NoStock();
        uint256 due = uint256(it.price) * qty;
        if (msg.value != due) revert BadPay();
        it.stock -= qty;
        _escrow += due;
        n = _orders.length;
        _orders.push(Order(msg.sender, uint96(due), uint32(sku), qty, uint64(block.timestamp), 0, contact));
    }

    /// The seller marks it shipped; money still does not move.
    function ship(uint256 n) external onlyHolder {
        Order storage o = _orders[n];
        if (o.state != 0) revert NotOpen();
        o.state = 1;
    }

    /// After the window, either side can settle it to the seller.
    function settle(uint256 n) external {
        Order storage o = _orders[n];
        if (o.state != 1) revert NotOpen();
        if (block.timestamp < o.placed + WINDOW) revert TooSoon();
        o.state = 3;
        _escrow -= o.paid;
        (bool ok,) = _holder().call{value: o.paid}("");
        require(ok);
    }

    /// Unshipped and stale, or the seller relents: the buyer gets it back.
    function refund(uint256 n) external {
        Order storage o = _orders[n];
        if (o.state > 1) revert NotOpen();
        bool stale = o.state == 0 && block.timestamp >= o.placed + WINDOW;
        if (!stale && msg.sender != _holder()) revert NotHolder();
        o.state = 2;
        _escrow -= o.paid;
        _items[o.sku].stock += o.qty;
        (bool ok,) = o.buyer.call{value: o.paid}("");
        require(ok);
    }

    /*───────── the server ─────────*/

    function request(string[] memory resource, KeyValue[] memory params)
        external view returns (uint16, string memory, KeyValue[] memory)
    {
        params;
        (, , uint256 id) = token();
        if (resource.length == 0 || _eq(resource[0], "")) {
            return (200, _shop(id), _headers("text/html; charset=utf-8"));
        }
        if (_eq(resource[0], "items.json")) {
            return (200, _json(), _headers("application/json"));
        }
        return (404, "not found", _headers("text/plain; charset=utf-8"));
    }

    function _headers(string memory ct) private pure returns (KeyValue[] memory h) {
        h = new KeyValue[](5);
        h[0] = KeyValue("Content-Type", ct);
        h[1] = KeyValue("Cache-Control", "no-cache");
        h[2] = KeyValue("X-Content-Type-Options", "nosniff");
        h[3] = KeyValue("Content-Security-Policy", CSP);
        h[4] = KeyValue("Referrer-Policy", "no-referrer");
    }

    /*  The page is written BY THE CONTRACT. The only holder bytes that
        reach it are the item name, escaped, inside a text node.        */
    function _shop(uint256 id) private view returns (string memory out) {
        out = string.concat(
            "<!doctype html><meta charset=utf-8><title>Stall ",
            id.str(),
            "</title><style>body{font:16px/1.5 ui-monospace,monospace;margin:3rem auto;max-width:34rem}"
            "li{margin:.6rem 0}</style><h1>Stall ", id.str(), "</h1><ul>"
        );
        uint256 n = _items.length;
        for (uint256 i; i < n; ++i) {
            Item memory it = _items[i];
            out = string.concat(
                out, "<li>", Web.esc(string(SSTORE2.read(it.ptr))),
                " &middot; ", uint256(it.price).str(), " wei &middot; ",
                uint256(it.stock).str(), " left</li>"
            );
        }
        out = string.concat(out, "</ul>");
    }

    function _json() private view returns (string memory out) {
        out = "[";
        uint256 n = _items.length;
        for (uint256 i; i < n; ++i) {
            Item memory it = _items[i];
            out = string.concat(
                out, i == 0 ? "" : ",",
                "{\"sku\":", i.str(),
                ",\"name\":\"", Web.jsonEsc(string(SSTORE2.read(it.ptr))),
                "\",\"price\":", uint256(it.price).str(),
                ",\"stock\":", uint256(it.stock).str(), "}"
            );
        }
        out = string.concat(out, "]");
    }

    function itemCount() external view returns (uint256) { return _items.length; }
    function orderCount() external view returns (uint256) { return _orders.length; }
    function escrowed() external view returns (uint256) { return _escrow; }

    function _eq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    receive() external payable {}
}

contract HubStub {
    address public immutable OWNER;
    constructor(address o) { OWNER = o; }
    function ownerOf(uint256) external view returns (address) { return OWNER; }
}
