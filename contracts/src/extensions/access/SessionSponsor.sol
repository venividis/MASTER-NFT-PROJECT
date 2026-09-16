// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SignatureChecker} from "../../lib/Crypto.sol";

interface ISponsoredAccount {
    function currentOwner() external view returns(address);
    function sessionEpoch() external view returns(uint64);
    function actionNonce() external view returns(uint256);
    struct ActionGrant {bytes32 adoption;address caller;address target;address asset;bytes32 dataHash;bytes32 targetCodeHash;uint112 perCall;uint112 remaining;uint96 value;uint48 expires;uint64 epoch;uint32 callsRemaining;bool revoked;}
    function actionGrant(uint256) external view returns(ActionGrant memory);
    function executeInstrument(uint256,uint256,bytes calldata) external returns(bytes memory);
}

/// @notice Native Genesis-session sponsorship. This is not an ERC-4337 paymaster.
/// Both owner and sponsor sign the exact call and maximum reimbursement. A relayer
/// funds gas; only the named sponsor's deposited balance reimburses it.
contract SessionSponsor {
    struct Request {
        address account; address target; uint256 value; bytes32 dataHash;
        uint64 epoch; uint256 accountNonce; uint256 nonce; uint48 deadline;
        address sponsor; address relayer; uint256 callGas; uint256 maxGasPrice; uint256 maxRefund; uint256 instrumentId;
    }
    bytes32 public constant REQUEST_TYPEHASH=keccak256("Request(address account,address target,uint256 value,bytes32 dataHash,uint64 epoch,uint256 accountNonce,uint256 nonce,uint48 deadline,address sponsor,address relayer,uint256 callGas,uint256 maxGasPrice,uint256 maxRefund,uint256 instrumentId)");
    bytes32 private constant DOMAIN_TYPEHASH=keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    mapping(address=>uint256) public deposits;
    mapping(address=>uint256) public credits;
    mapping(bytes32=>bool) public used;
    uint256 private entered;
    error Invalid(); error Unauthorized(); error Insufficient(); error TransferFailed();
    event Deposited(address indexed sponsor,uint256 amount);
    event Relayed(bytes32 indexed digest,address indexed account,address indexed sponsor,address relayer,bool success,uint256 refund);
    modifier lock(){if(entered!=0)revert Invalid();entered=1;_;entered=0;}
    function domainSeparator() public view returns(bytes32){return keccak256(abi.encode(DOMAIN_TYPEHASH,keccak256("ANIMA Session Sponsor"),keccak256("2"),block.chainid,address(this)));}
    function requestDigest(Request calldata r) public view returns(bytes32){return keccak256(abi.encodePacked("\x19\x01",domainSeparator(),keccak256(abi.encode(REQUEST_TYPEHASH,r))));}
    function depositFor(address sponsor) external payable {if(sponsor==address(0)||msg.value==0)revert Invalid();deposits[sponsor]+=msg.value;emit Deposited(sponsor,msg.value);}
    function withdrawDeposit(uint256 amount,address payable recipient) external lock {if(recipient==address(0)||amount>deposits[msg.sender])revert Insufficient();deposits[msg.sender]-=amount;(bool ok,)=recipient.call{value:amount}("");if(!ok)revert TransferFailed();}
    function withdrawCredit(address payable recipient) external lock {if(recipient==address(0))revert Invalid();uint256 amount=credits[msg.sender];credits[msg.sender]=0;(bool ok,)=recipient.call{value:amount}("");if(!ok)revert TransferFailed();}
    function cancel(Request calldata r) external {if(msg.sender!=r.sponsor&&msg.sender!=ISponsoredAccount(r.account).currentOwner())revert Unauthorized();used[requestDigest(r)]=true;}
    function relay(Request calldata r,bytes calldata data,bytes calldata ownerSignature,bytes calldata sponsorSignature) external lock returns(bool success,uint256 refund){
        uint256 startingGas=gasleft();
        if(r.account.code.length==0||r.target==address(0)||r.sponsor==address(0)||r.relayer!=msg.sender||r.deadline<block.timestamp||r.callGas<25000||r.callGas>5000000||r.maxRefund==0||r.maxGasPrice==0||keccak256(data)!=r.dataHash||data.length>32768||tx.gasprice>r.maxGasPrice)revert Invalid();
        ISponsoredAccount account=ISponsoredAccount(r.account);
        if(account.sessionEpoch()!=r.epoch||account.actionNonce()!=r.accountNonce)revert Invalid();
        ISponsoredAccount.ActionGrant memory grant=account.actionGrant(r.instrumentId);
        if(grant.caller!=address(this)||grant.target!=r.target||grant.dataHash!=r.dataHash||grant.value!=r.value||grant.revoked||grant.epoch!=r.epoch||grant.expires<r.deadline||grant.callsRemaining==0||grant.remaining==0)revert Invalid();
        bytes32 digest=requestDigest(r);
        if(used[digest])revert Invalid();
        if(!SignatureChecker.isValidSignatureNow(account.currentOwner(),digest,ownerSignature)||!SignatureChecker.isValidSignatureNow(r.sponsor,digest,sponsorSignature))revert Unauthorized();
        if(deposits[r.sponsor]<r.maxRefund)revert Insufficient();
        used[digest]=true;deposits[r.sponsor]-=r.maxRefund;
        bytes memory callData=abi.encodeCall(ISponsoredAccount.executeInstrument,(r.instrumentId,r.accountNonce,data));
        // EIP-150 cannot silently reduce the reviewed call budget. Return data is
        // deliberately not copied, so a target cannot force an unbounded allocation.
        if(gasleft()<r.callGas+r.callGas/63+80000)revert Insufficient();
        address destination=r.account;uint256 callGas=r.callGas;
        assembly("memory-safe"){success:=call(callGas,destination,0,add(callData,32),mload(callData),0,0)}
        // The signed cap includes the relayer's estimate of intrinsic/settlement gas.
        // Exact L1 calldata/blob fees are not inferred or charged to the NFT.
        refund=(startingGas-gasleft()+45000)*tx.gasprice;
        if(refund>r.maxRefund)refund=r.maxRefund;
        deposits[r.sponsor]+=r.maxRefund-refund;credits[msg.sender]+=refund;
        emit Relayed(digest,r.account,r.sponsor,msg.sender,success,refund);
    }
}
