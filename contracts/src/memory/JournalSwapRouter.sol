// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IProtocolCollection} from "../protocol/ProtocolPrimitives.sol";
import {MemoryLedger} from "./MemoryLedger.sol";
interface IJournalMarket {
    function swap(address tokenIn,address tokenOut,uint112 amount,uint112 minOut,
        uint48 deadline,uint256 identity,uint64 lockUntil) external payable returns(uint256,uint256);
}
/// @notice Optional atomic before-note -> exact-input swap -> measured fill binding.
/// @dev Deployment and verification status belong to release records. No oracle or scheduler.
/// The configured market is the inherited actual-v4 adapter, not Dave's custom Charter.
/// This narrow source route returns assets to the calling NFT account; journaled swap+lock
/// needs a separate reviewed source integration. The local UI supports its existing lock path.
contract JournalSwapRouter is ProtocolGuard {
    MemoryLedger public immutable journal;
    address public immutable market;
    IProtocolCollection public immutable collection;
    mapping(address=>uint256) public nonces;
    struct Order {
        uint256 identity;
        uint256 nonce;
        address input;
        address output;
        uint112 amount;
        uint112 minOut;
        uint48 deadline;
        uint8 privacyMode;
        bool imprint;
        bytes32 expectedJournalHead;
    }
    error InvalidOrder(); error UnexpectedOutput();
    constructor(address journal_,address market_) {
        if(journal_.code.length==0||market_.code.length==0) revert Unauthorized();
        journal=MemoryLedger(journal_);market=market_;
        collection=IProtocolCollection(address(MemoryLedger(journal_).collection()));
    }
    receive() external payable {if(msg.sender!=market)revert Unauthorized();}
    function swapAndInscribe(Order calldata o,bytes calldata payload)
        external payable nonReentrant returns(uint256 entry,uint256 received)
    {
        if(journal.router()!=address(this)||o.identity==0||collection.accountOf(o.identity)!=msg.sender||o.nonce!=nonces[msg.sender]||o.input==o.output||o.deadline<block.timestamp)revert InvalidOrder();
        _amount(o.amount);_amount(o.minOut);
        if(msg.value!=(o.input==address(0)?o.amount:0))revert InvalidOrder();
        address beforeOwner=collection.ownerOf(o.identity);
        bytes32 plan=keccak256(abi.encode("IDFBI_JOURNALED_SWAP_1_7",block.chainid,address(this),msg.sender,o,keccak256(payload)));
        nonces[msg.sender]++;
        entry=journal.beforeSwap(msg.sender,o.identity,o.privacyMode,o.imprint,plan,o.expectedJournalHead,payload);
        uint256 oldInput=ProtocolAssets.balance(o.input,address(this))-(o.input==address(0)?msg.value:0);
        if(o.input!=address(0)){
            ProtocolAssets.pull(o.input,msg.sender,o.amount);
            ProtocolAssets.approveExact(o.input,market,o.amount);
        }
        uint256 beforeOutput=ProtocolAssets.balance(o.output,address(this));
        (uint256 quoted,uint256 unexpectedLock)=IJournalMarket(market).swap{value:msg.value}(
            o.input,o.output,o.amount,o.minOut,o.deadline,0,0);
        if(o.input!=address(0))ProtocolAssets.approveExact(o.input,market,0);
        uint256 afterOutput=ProtocolAssets.balance(o.output,address(this));
        if(afterOutput<beforeOutput||unexpectedLock!=0)revert UnexpectedOutput();
        received=afterOutput-beforeOutput;
        if(received!=quoted||received<o.minOut||received>type(uint112).max||ProtocolAssets.balance(o.input,address(this))!=oldInput)revert UnexpectedOutput();
        ProtocolAssets.push(o.output,msg.sender,received);
        if(collection.ownerOf(o.identity)!=beforeOwner)revert InvalidOrder();
        journal.bindFill(entry,o.input,o.output,o.amount,uint112(received));
        // Any failure above reverts the before-note, nonce, approvals, swap and binding.
    }
}
