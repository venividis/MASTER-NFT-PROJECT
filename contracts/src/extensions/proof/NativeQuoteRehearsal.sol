// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NativeQuoteGroth16Verifier} from "./NativeQuoteGroth16Verifier.sol";

interface IQuoteMarket {
    function ledger() external view returns(address);
    function poolInfo(address) external view returns(uint112,uint112,uint64,uint256,uint256);
    function swap(address,address,uint112,uint112,uint48,uint256,uint64) external payable returns(uint256,uint256);
}
interface IQuoteLedger {
    function market() external view returns(address);
    function collection() external view returns(address);
    function isSealed() external view returns(bool);
}
interface IQuoteCollection { function accountOf(uint256) external view returns(address); }
interface IQuoteAccount {
    function collection() external view returns(address);
    function tokenId() external view returns(uint256);
    function currentOwner() external view returns(address);
    function sessionEpoch() external view returns(uint64);
    function actionNonce() external view returns(uint256);
    function mode() external view returns(uint8);
}

/// @notice Read-only, state-bound proof of one-hop NativeMarket arithmetic.
/// @dev DEVELOPMENT TRUSTED SETUP. NOT an EVM execution proof or spend authorization.
///      Does not prove balances, ERC20 behavior, gas, transfers, ledger callbacks or future state.
contract NativeQuoteRehearsal {
    bytes32 public constant DOMAIN = keccak256("ANIMA_NATIVE_QUOTE_REHEARSAL_V1");
    bool public constant productionReady = false;
    IQuoteMarket public immutable market;
    IQuoteLedger public immutable ledger;
    address public immutable collection;
    bytes32 public immutable marketCodeHash;
    NativeQuoteGroth16Verifier public immutable verifier;

    struct Anchor {
        address account;
        uint64 epoch;
        uint256 nonce;
        uint64 sourceBlock;
        bytes32 sourceHash;
        bytes data;
        uint256 value;
        bytes transactionData;
    }
    error InvalidContext(); error StaleState(); error UnsupportedRoute(); error InvalidProof();

    constructor(address market_) {
        if(market_.code.length==0) revert InvalidContext();
        market=IQuoteMarket(market_);
        IQuoteLedger l=IQuoteLedger(IQuoteMarket(market_).ledger());
        if(!l.isSealed() || l.market()!=market_ || l.collection().code.length==0) revert InvalidContext();
        ledger=l; collection=l.collection(); marketCodeHash=market_.codehash;
        verifier=new NativeQuoteGroth16Verifier();
    }

    /// @notice Context includes current custody and exact account action, not merely a quote hash.
    function contextHash(Anchor calldata anchor) public view returns(bytes32) {
        return keccak256(abi.encode(DOMAIN,block.chainid,address(this),address(market),marketCodeHash,
            anchor.account,IQuoteAccount(anchor.account).currentOwner(),anchor.epoch,anchor.nonce,
            anchor.sourceBlock,anchor.sourceHash,keccak256(anchor.data),anchor.value,keccak256(anchor.transactionData)));
    }

    /// @notice Public signals: output, next reserve in/out, Poseidon binding, context high/low,
    ///         amount, reserve in/out, minimum. All are bound by the generated Groth16 verifier.
    function check(Anchor calldata anchor,uint256[2] calldata a,uint256[2][2] calldata b,
        uint256[2] calldata c,uint256[10] calldata signals) external view returns(uint112 output) {
        if(address(market).codehash!=marketCodeHash || !ledger.isSealed() || ledger.market()!=address(market)) revert InvalidContext();
        if(anchor.sourceBlock>=block.number || block.number-anchor.sourceBlock>256 ||
            anchor.sourceHash==bytes32(0) || blockhash(anchor.sourceBlock)!=anchor.sourceHash) revert StaleState();
        IQuoteAccount account=IQuoteAccount(anchor.account);
        if(account.mode()!=0 || account.collection()!=collection ||
            IQuoteCollection(collection).accountOf(account.tokenId())!=anchor.account || account.currentOwner()==address(0)) revert InvalidContext();
        if(account.sessionEpoch()!=anchor.epoch || account.actionNonce()!=anchor.nonce) revert StaleState();
        if(anchor.data.length!=228 || bytes4(anchor.data[:4])!=IQuoteMarket.swap.selector) revert UnsupportedRoute();
        (address input,address out,uint112 amount,uint112 minimum,uint48 deadline,uint256 identity,uint64 lockUntil)=
            abi.decode(anchor.data[4:],(address,address,uint112,uint112,uint48,uint256,uint64));
        if(keccak256(anchor.data)!=keccak256(abi.encodeCall(IQuoteMarket.swap,(input,out,amount,minimum,deadline,identity,lockUntil)))) revert InvalidContext();
        if(input==out || (input!=address(0) && out!=address(0)) || lockUntil!=0 || identity!=account.tokenId()) revert UnsupportedRoute();
        if(deadline<block.timestamp || anchor.value!=(input==address(0)?amount:0)) revert StaleState();
        _checkTransaction(anchor,input,amount);
        (uint112 nativeReserve,uint112 tokenReserve,uint64 createdAt,,)=market.poolInfo(input==address(0)?out:input);
        if(createdAt==0) revert InvalidContext();
        uint112 reserveIn=input==address(0)?nativeReserve:tokenReserve;
        uint112 reserveOut=input==address(0)?tokenReserve:nativeReserve;
        bytes32 context=contextHash(anchor);
        if(signals[4]!=(uint256(context)>>128) || signals[5]!=(uint256(context)&type(uint128).max) ||
            signals[6]!=amount || signals[7]!=reserveIn || signals[8]!=reserveOut || signals[9]!=minimum) revert StaleState();
        if(!verifier.verifyProof(a,b,c,signals)) revert InvalidProof();
        return uint112(signals[0]);
    }

    function _checkTransaction(Anchor calldata anchor,address input,uint112 amount) private view {
        bytes4 selector=bytes4(keccak256("executeUtility(uint256,uint48,address,address,uint256,bytes,uint256)"));
        if(anchor.transactionData.length<4 || bytes4(anchor.transactionData[:4])!=selector) revert UnsupportedRoute();
        (uint256 nonce,uint48 expiry,address asset,address target,uint256 value,bytes memory data,uint256 allowance)=
            abi.decode(anchor.transactionData[4:],(uint256,uint48,address,address,uint256,bytes,uint256));
        if(nonce!=anchor.nonce || expiry<block.timestamp || asset!=input || target!=address(market) || value!=anchor.value ||
            keccak256(data)!=keccak256(anchor.data) || allowance!=(input==address(0)?0:amount) ||
            keccak256(anchor.transactionData)!=keccak256(abi.encodeWithSelector(selector,nonce,expiry,asset,target,value,data,allowance))) revert InvalidContext();
    }
}
