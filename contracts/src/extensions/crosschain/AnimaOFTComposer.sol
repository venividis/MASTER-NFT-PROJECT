// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IAnimaOFT,IBridgeToken,BridgeToken,BridgeAction} from "./LayerZeroInterfaces.sol";
interface IBridgeTimeVault { function deposit(address,uint112,address,uint64,uint64,uint64,bool,uint256) external payable returns(uint256); }

/// @notice Authenticated OFT horizontal composition. A failed destination lock
/// becomes a recipient-owned credit. Retry preserves its exact original terms;
/// refund pays that destination credit, never a second refund on the source.
contract AnimaOFTComposer {
    address public immutable endpoint;
    address public immutable oft;
    address public immutable token;
    uint32 public immutable sourceEid;
    bytes32 public immutable sourceRouter;
    bytes32 public immutable sourcePeer;
    address public immutable timeVault;
    bytes32 public immutable timeVaultCodeHash;
    bytes32 public immutable oftCodeHash;
    uint256 public liability;
    uint256 private entered;
    struct Delivery {address recipient; uint256 amount; bytes32 actionHash; uint256 lockId; uint8 status;}
    mapping(bytes32=>Delivery) public deliveries;
    mapping(bytes32=>BridgeAction) private originalActions;
    mapping(address=>bytes32[]) private recipientDeliveries;
    event BridgeReceived(bytes32 indexed guid,address indexed recipient,uint256 amount,bytes32 actionHash);
    event BridgeExecuted(bytes32 indexed guid,address indexed recipient,uint256 paid,uint256 lockId);
    event BridgeDeferred(bytes32 indexed guid,bytes reason);
    event BridgeRefunded(bytes32 indexed guid,address indexed recipient,uint256 amount);
    modifier guard(){require(entered==0,"REENTRY");entered=1;_;entered=0;}
    constructor(address endpoint_,address oft_,uint32 eid_,bytes32 router_,bytes32 peer_,address vault_) {
        require(endpoint_.code.length!=0 && oft_.code.length!=0 && eid_!=0 && router_!=0 && peer_!=0,"INVALID_LANE");
        require(IAnimaOFT(oft_).endpoint()==endpoint_,"WRONG_ENDPOINT");
        require(vault_==address(0) || vault_.code.length!=0,"INVALID_VAULT");
        endpoint=endpoint_;oft=oft_;token=IAnimaOFT(oft_).token();sourceEid=eid_;sourceRouter=router_;sourcePeer=peer_;
        require(token.code.length!=0,"INVALID_TOKEN");
        timeVault=vault_;timeVaultCodeHash=vault_.codehash;oftCodeHash=oft_.codehash;
    }
    function lzCompose(address from,bytes32 guid,bytes calldata message,address,bytes calldata) external payable guard {
        require(msg.sender==endpoint && from==oft && msg.value==0,"UNAUTHENTICATED_TRANSPORT");
        require(oft.codehash==oftCodeHash && IAnimaOFT(oft).endpoint()==endpoint && IAnimaOFT(oft).token()==token && IAnimaOFT(oft).peers(sourceEid)==sourcePeer,"LANE_CHANGED");
        // Official OFTComposeMsgCodec: uint64 nonce | uint32 srcEid |
        // uint256 amountLD | bytes32 composeFrom | abi.encode(BridgeAction).
        require(message.length==332 && uint32(bytes4(message[8:12]))==sourceEid && bytes32(message[44:76])==sourceRouter,"UNTRUSTED_ORIGIN");
        uint256 amount=uint256(bytes32(message[12:44]));
        BridgeAction memory action=abi.decode(message[76:],(BridgeAction));
        require(guid!=0 && deliveries[guid].status==0 && amount!=0,"DUPLICATE_OR_EMPTY");
        require(action.recipient!=address(0) && action.recipient!=address(this),"INVALID_RECIPIENT");
        require(IBridgeToken(token).balanceOf(address(this))>=liability+amount,"UNFUNDED_MESSAGE");
        deliveries[guid]=Delivery(action.recipient,amount,keccak256(abi.encode(action)),0,1);
        originalActions[guid]=action; recipientDeliveries[action.recipient].push(guid); liability+=amount;
        emit BridgeReceived(guid,action.recipient,amount,keccak256(abi.encode(action)));
        _attempt(guid,action);
    }
    function retry(bytes32 guid,BridgeAction calldata action) external guard {
        require(deliveries[guid].status==1 && deliveries[guid].actionHash==keccak256(abi.encode(action)),"NOT_RETRYABLE");
        _attempt(guid,action);
    }
    function _attempt(bytes32 guid,BridgeAction memory action) private {
        try this.execute(guid,action) {} catch(bytes memory reason) { emit BridgeDeferred(guid,reason); }
    }
    function execute(bytes32 guid,BridgeAction calldata action) external {
        require(msg.sender==address(this),"SELF_ONLY");
        Delivery storage delivery=deliveries[guid];
        require(block.timestamp<=action.deadline && delivery.amount>=action.minimumReceived && action.lockAmount<=delivery.amount,"DESTINATION_TERMS");
        delivery.status=2; liability-=delivery.amount;
        uint256 beforeBalance=IBridgeToken(token).balanceOf(address(this));
        if(action.lockAmount!=0) {
            require(timeVault!=address(0) && timeVault.codehash==timeVaultCodeHash,"VAULT_UNAVAILABLE");
            BridgeToken.approve(token,timeVault,action.lockAmount);
            delivery.lockId=IBridgeTimeVault(timeVault).deposit(token,action.lockAmount,action.recipient,action.start,action.cliff,action.end,action.linear,0);
            BridgeToken.approve(token,timeVault,0);
        }
        BridgeToken.push(token,action.recipient,delivery.amount-action.lockAmount);
        require(IBridgeToken(token).balanceOf(address(this))+delivery.amount==beforeBalance,"NONEXACT_EXECUTION");
        emit BridgeExecuted(guid,action.recipient,delivery.amount-action.lockAmount,delivery.lockId);
    }
    function refund(bytes32 guid) external guard {
        Delivery storage delivery=deliveries[guid];
        require(delivery.status==1 && msg.sender==delivery.recipient,"RECIPIENT_ONLY");
        delivery.status=3;liability-=delivery.amount;BridgeToken.push(token,delivery.recipient,delivery.amount);
        emit BridgeRefunded(guid,delivery.recipient,delivery.amount);
    }
    function deliveryAction(bytes32 guid) external view returns(BridgeAction memory){return originalActions[guid];}
    function deliveryCount(address recipient) external view returns(uint256){return recipientDeliveries[recipient].length;}
    function deliveryId(address recipient,uint256 index) external view returns(bytes32){return recipientDeliveries[recipient][index];}
}
