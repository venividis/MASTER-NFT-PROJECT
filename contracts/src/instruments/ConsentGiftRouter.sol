// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolGuard, ProtocolAssets, IWorldLedger} from "../protocol/ProtocolPrimitives.sol";
import {TimeVault} from "../protocol/TimeVault.sol";

interface IExactInputMarket {
    function swap(address tokenIn,address tokenOut,uint112 amount,uint112 minOut,
        uint48 deadline,uint256 identity,uint64 lockUntil)
        external payable returns(uint256 output,uint256 lockId);
}

/// @notice Optional direct-funding or swap -> consent escrow -> fixed-date vault gift.
/// @dev Optional instrument. Deployment status belongs to release records. No arbitrary targets/delegatecall.
/// An offer is revocable UNTIL acceptance; acceptance fixes an ordinary TimeVault claim.
/// A recipient NFT account carries the claim across later NFT sales. A personal recipient
/// does not. Source identity is attributed only after collection.accountOf validation.
/// This module does not promise AI inference, MEV protection, privacy, or chain finality.
contract ConsentGiftRouter is ProtocolGuard {
    IWorldLedger public immutable ledger;
    address public immutable market;
    TimeVault public immutable vault;
    uint256 public giftCount;
    mapping(address=>uint256) public nonces;
    mapping(address=>uint256) public liability;
    mapping(address=>bytes32) public accountCommitment;

    enum Status { Missing, Offered, Accepted, Returned }
    struct Terms {
        address recipient;
        uint64 releaseAt;
        uint64 acceptBy;
        uint48 deadline;
        uint256 sourceIdentity;
        uint256 expectedNonce;
    }
    struct Gift {
        address donor;
        address recipient;
        address asset;
        uint112 amount;
        uint64 releaseAt;
        uint64 acceptBy;
        uint256 sourceIdentity;
        Status status;
        uint256 vaultLock;
    }
    mapping(uint256=>Gift) private gifts;
    event GiftOffered(uint256 indexed id,address indexed donor,address indexed recipient,
        address asset,uint256 amount,uint64 releaseAt,uint64 acceptBy,uint256 sourceIdentity);
    event GiftAccepted(uint256 indexed id,address indexed recipient,uint256 indexed vaultLock);
    event GiftReturned(uint256 indexed id,address indexed donor,address indexed trigger);
    error InvalidTerms(); error StaleNonce(); error BadResult(); error GiftUnavailable();

    // Explicit dependencies allow construction before WorldLedger sealing, avoiding
    // the exchange -> commitment-index -> router -> sealed-ledger deployment cycle.
    // offer() still requires sealed, matching dependencies before accepting any funds.
    constructor(address ledger_,address market_,address vault_) {
        if(ledger_.code.length==0||market_.code.length==0||vault_.code.length==0) revert Unauthorized();
        ledger=IWorldLedger(ledger_);market=market_;vault=TimeVault(vault_);
    }
    // PoolManager adapter may pay native output to this router. Users fund offer() explicitly.
    // Forced native transfers cannot be prevented, but never count toward a gift's allocation.
    receive() external payable { if(msg.sender!=market) revert Unauthorized(); }

    function offer(address assetIn,address assetOut,uint112 amount,uint112 minOut,Terms calldata t)
        external payable nonReentrant returns(uint256 id)
    {
        _amount(amount);_amount(minOut);_identity(ledger.collection(),msg.sender,t.sourceIdentity);
        if(!ledger.isSealed()||ledger.market()!=market||ledger.vault()!=address(vault)) revert Unauthorized();
        if(t.expectedNonce!=nonces[msg.sender]) revert StaleNonce();
        if(block.timestamp>t.deadline||t.recipient==address(0)||t.recipient==address(this)||
           t.acceptBy<=block.timestamp||t.acceptBy>=t.releaseAt||
           t.acceptBy>block.timestamp+30 days||t.releaseAt>block.timestamp+3650 days) revert InvalidTerms();
        nonces[msg.sender]++;
        if(assetIn==address(0)){ if(msg.value!=amount) revert InvalidAmount(); }
        else { if(msg.value!=0) revert InvalidAmount(); ProtocolAssets.pull(assetIn,msg.sender,amount); }
        uint256 output=amount;
        if(assetIn!=assetOut){
            uint256 beforeOutput=ProtocolAssets.balance(assetOut,address(this));
            if(assetIn!=address(0)) ProtocolAssets.approveExact(assetIn,market,amount);
            // The MARKET accurately sees the router as its caller. It must not accept a
            // fabricated end-user identity from hookData. Our GiftOffered event carries donor.
            (output,)=IExactInputMarket(market).swap{value:assetIn==address(0)?amount:0}(
                assetIn,assetOut,amount,minOut,t.deadline,0,0);
            if(assetIn!=address(0)) ProtocolAssets.approveExact(assetIn,market,0);
            if(ProtocolAssets.balance(assetOut,address(this))!=beforeOutput+output) revert BadResult();
        }
        _amount(output);if(output<minOut) revert BadResult();
        id=++giftCount;
        gifts[id]=Gift(msg.sender,t.recipient,assetOut,uint112(output),t.releaseAt,t.acceptBy,
            t.sourceIdentity,Status.Offered,0);
        liability[assetOut]+=output;
        _touchGift(id);
        emit GiftOffered(id,msg.sender,t.recipient,assetOut,output,t.releaseAt,t.acceptBy,t.sourceIdentity);
    }

    function accept(uint256 id) external nonReentrant returns(uint256 lockId) {
        Gift storage g=gifts[id];
        if(g.status!=Status.Offered||msg.sender!=g.recipient||block.timestamp>=g.acceptBy) revert GiftUnavailable();
        g.status=Status.Accepted;liability[g.asset]-=g.amount;
        if(g.asset!=address(0)) ProtocolAssets.approveExact(g.asset,address(vault),g.amount);
        // Router is the depositor. Gift identity attribution stays in GiftOffered,
        // not a false identity claim in the vault's native activity log.
        lockId=vault.deposit{value:g.asset==address(0)?g.amount:0}(g.asset,g.amount,g.recipient,
            uint64(block.timestamp),g.releaseAt,g.releaseAt,false,0);
        if(g.asset!=address(0)) ProtocolAssets.approveExact(g.asset,address(vault),0);
        g.vaultLock=lockId;
        _touchGift(id);
        emit GiftAccepted(id,g.recipient,lockId);
    }

    /// @notice Donor may cancel before acceptance. After expiry anyone may return funds,
    /// always to the donor address. Never callable for an accepted gift.
    function returnOffer(uint256 id) external nonReentrant {
        Gift storage g=gifts[id];
        if(g.status!=Status.Offered||(msg.sender!=g.donor&&block.timestamp<g.acceptBy)) revert GiftUnavailable();
        g.status=Status.Returned;liability[g.asset]-=g.amount;
        _touchGift(id);
        ProtocolAssets.push(g.asset,g.donor,g.amount);
        emit GiftReturned(id,g.donor,msg.sender);
    }
    function _touchGift(uint256 id) private {Gift storage g=gifts[id];bytes32 h=keccak256(abi.encode(id,g));accountCommitment[g.donor]=keccak256(abi.encode(accountCommitment[g.donor],h));if(g.recipient!=g.donor)accountCommitment[g.recipient]=keccak256(abi.encode(accountCommitment[g.recipient],h));}
    function giftInfo(uint256 id) external view returns(Gift memory){return gifts[id];}
    function version() external pure returns(bytes32){return keccak256("idfbi/consent-gift/1.5");}
}
