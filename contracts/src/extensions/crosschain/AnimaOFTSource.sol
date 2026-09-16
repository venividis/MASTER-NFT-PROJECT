// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IAnimaOFT,IBridgeToken,BridgeToken,SendParam,MessagingFee,MessagingReceipt,OFTReceipt,BridgeAction} from "./LayerZeroInterfaces.sol";

/// @notice One immutable OFT lane. The existing asset's real OFT performs its
/// debit; a destination composer either pays the recipient or deposits an exact
/// amount into the selected TimeVault. This router never manufactures a bridge.
contract AnimaOFTSource {
    IAnimaOFT public immutable oft;
    address public immutable token;
    address public immutable endpoint;
    uint32 public immutable destinationEid;
    address public immutable composer;
    bytes32 public immutable destinationPeer;
    bytes32 public immutable oftCodeHash;
    uint256 private entered;
    event BridgeSent(bytes32 indexed guid,address indexed sender,address indexed recipient,uint32 destinationEid,address composer,uint256 amountSent,uint256 amountReceived,bytes32 actionHash);
    constructor(address oft_,uint32 eid_,address composer_,bytes32 peer_) {
        require(oft_.code.length!=0 && eid_!=0 && composer_!=address(0) && peer_!=0,"INVALID_LANE");
        oft=IAnimaOFT(oft_); token=IAnimaOFT(oft_).token(); endpoint=IAnimaOFT(oft_).endpoint();
        require(token.code.length!=0 && endpoint.code.length!=0,"INVALID_ASSET");
        destinationEid=eid_; composer=composer_; destinationPeer=peer_; oftCodeHash=oft_.codehash;
    }
    function parameters(uint256 amount,uint256 minimum,BridgeAction calldata action,bytes calldata options) public view returns(SendParam memory) {
        require(amount!=0 && minimum!=0 && minimum<=amount && action.recipient!=address(0) && action.recipient!=composer,"INVALID_BUDGET");
        require(action.minimumReceived!=0 && action.deadline>=block.timestamp && options.length<=1024,"INVALID_EXECUTION");
        require(address(oft).codehash==oftCodeHash && oft.endpoint()==endpoint && oft.token()==token && oft.peers(destinationEid)==destinationPeer,"LANE_CHANGED");
        return SendParam(destinationEid,bytes32(uint256(uint160(composer))),amount,minimum,options,abi.encode(action),"");
    }
    function quote(uint256 amount,uint256 minimum,BridgeAction calldata action,bytes calldata options) external view returns(MessagingFee memory) {
        return oft.quoteSend(parameters(amount,minimum,action,options),false);
    }
    function bridge(uint256 amount,uint256 minimum,BridgeAction calldata action,bytes calldata options,uint256 maximumNativeFee) external payable returns(bytes32 guid) {
        require(entered==0,"REENTRY"); entered=1;
        SendParam memory params=parameters(amount,minimum,action,options);
        MessagingFee memory fee=oft.quoteSend(params,false);
        require(fee.lzTokenFee==0 && fee.nativeFee<=maximumNativeFee && msg.value==maximumNativeFee,"FEE_CHANGED");
        uint256 beforeBalance=IBridgeToken(token).balanceOf(address(this));
        BridgeToken.pull(token,msg.sender,amount);
        require(IBridgeToken(token).balanceOf(address(this))==beforeBalance+amount,"NONEXACT_TOKEN");
        if(oft.approvalRequired())BridgeToken.approve(token,address(oft),amount);
        (MessagingReceipt memory receipt,OFTReceipt memory assets)=oft.send{value:msg.value}(params,MessagingFee(msg.value,0),msg.sender);
        if(oft.approvalRequired())BridgeToken.approve(token,address(oft),0);
        uint256 afterBalance=IBridgeToken(token).balanceOf(address(this));
        require(afterBalance>=beforeBalance && assets.amountSentLD==amount-(afterBalance-beforeBalance) && assets.amountSentLD>=minimum && assets.amountReceivedLD>=minimum,"INVALID_OFT_ACCOUNTING");
        BridgeToken.push(token,msg.sender,afterBalance-beforeBalance);
        guid=receipt.guid; require(guid!=0,"NO_MESSAGE_RECEIPT");
        emit BridgeSent(guid,msg.sender,action.recipient,destinationEid,composer,assets.amountSentLD,assets.amountReceivedLD,keccak256(abi.encode(action)));
        entered=0;
    }
}
