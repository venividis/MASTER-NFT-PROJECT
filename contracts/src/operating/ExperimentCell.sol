// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets,ProtocolGuard} from '../protocol/ProtocolPrimitives.sol';
import {IOperatingAccount} from './OperatingInterfaces.sol';
/// @notice Separate account, separate funded balance, no root execution or delegatecall.
/// @dev Permissions reset by the root epoch; invested positions remain external module claims.
/// External approvals outside this contract and untracked donated assets are not certified.
contract ExperimentCell is ProtocolGuard {
    IOperatingAccount public immutable root;
    struct Adoption{bytes32 codehash;uint64 epoch;}
    struct Input{address asset;uint112 maximum;}
    struct Output{address asset;uint112 minimum;}
    mapping(address=>Adoption) public adapters;
    address[] public tracked;
    mapping(address=>bool) public isTracked;
    // 0 active, 1 quarantined (unresolved), 2 retired after a verified zero balance.
    mapping(address=>uint8) public assetState;
    mapping(address=>bytes32) public assetEvidence;
    bytes32 public retiredHistory;
    event AssetHealthChanged(address indexed asset,uint8 state,bytes32 evidence,bytes32 codeHash);
    bytes32 public revision;
    uint256 public nonce;
    error InvalidAdapter();error BadEffect();error StaleEpoch();
    event CellAction(address indexed adapter,uint256 indexed nonce,bytes32 dataHash);
    constructor(address root_){if(root_.code.length==0)revert Unauthorized();root=IOperatingAccount(root_);isTracked[address(0)]=true;tracked.push(address(0));}
    modifier controller(){if(msg.sender!=address(root)&&(root.mode()!=0||msg.sender!=root.currentOwner()))revert Unauthorized();_;}
    receive() external payable{}
    function fund(address asset,uint112 amount) external payable controller nonReentrant{_amount(amount);_track(asset);if(asset==address(0)){if(msg.value!=amount)revert InvalidAmount();}else{if(msg.value!=0)revert InvalidAmount();ProtocolAssets.pull(asset,msg.sender,amount);}_mark('FUND',abi.encode(asset,amount));}
    function adopt(address adapter,address[] calldata outputAssets) external controller{if(adapter.code.length==0||adapter==address(root)||adapter==address(this)||outputAssets.length>8)revert InvalidAdapter();adapters[adapter]=Adoption(adapter.codehash,root.sessionEpoch());for(uint256 i;i<outputAssets.length;++i)_track(outputAssets[i]);_mark('ADOPT',abi.encode(adapter,adapter.codehash,root.sessionEpoch()));}
    function revoke(address adapter) external controller{delete adapters[adapter];_mark('REVOKE',abi.encode(adapter));}
    function execute(address adapter,bytes calldata data,Input[] calldata inputs,Output[] calldata outputs,uint48 deadline,uint256 expectedNonce) external controller nonReentrant returns(bytes memory result){
        Adoption memory p=adapters[adapter];uint64 epoch=root.sessionEpoch();address holder=root.currentOwner();uint8 initialMode=root.mode();
        if(p.codehash==0||p.codehash!=adapter.codehash||p.epoch!=epoch||block.timestamp>deadline||expectedNonce!=nonce||inputs.length>4||outputs.length>4||data.length<4||data.length>16384)revert InvalidAdapter();
        uint256[] memory beforeBalances=new uint256[](tracked.length);for(uint256 i;i<tracked.length;++i)if(assetState[tracked[i]]==0)beforeBalances[i]=_balance(tracked[i]);
        uint256[] memory beforeOut=new uint256[](outputs.length);for(uint256 i;i<outputs.length;++i){if(!isTracked[outputs[i].asset]||assetState[outputs[i].asset]!=0)revert BadEffect();beforeOut[i]=_balance(outputs[i].asset);}
        uint256 nativeValue;address previous;
        for(uint256 i;i<inputs.length;++i){Input calldata x=inputs[i];if((i!=0&&x.asset<=previous)||!isTracked[x.asset]||assetState[x.asset]!=0||x.asset==adapter||x.maximum==0)revert BadEffect();previous=x.asset;if(x.asset==address(0))nativeValue=x.maximum;else ProtocolAssets.approveExact(x.asset,adapter,x.maximum);}
        ++nonce;(bool ok,bytes memory returned)=adapter.call{value:nativeValue}(data);if(!ok){assembly('memory-safe'){revert(add(returned,32),mload(returned))}}result=returned;
        for(uint256 i;i<inputs.length;++i)if(inputs[i].asset!=address(0))ProtocolAssets.approveExact(inputs[i].asset,adapter,0);
        for(uint256 i;i<tracked.length;++i){address asset=tracked[i];if(assetState[asset]!=0)continue;uint256 permitted;for(uint256 j;j<inputs.length;++j)if(inputs[j].asset==asset)permitted=inputs[j].maximum;uint256 afterBalance=_balance(asset);if(afterBalance<beforeBalances[i]&&beforeBalances[i]-afterBalance>permitted)revert BadEffect();}
        for(uint256 i;i<outputs.length;++i)if(_balance(outputs[i].asset)<beforeOut[i]+outputs[i].minimum)revert BadEffect();
        if(root.mode()!=initialMode||root.sessionEpoch()!=epoch||root.currentOwner()!=holder)revert StaleEpoch();_mark('EXECUTE',abi.encode(adapter,keccak256(data),inputs,outputs));emit CellAction(adapter,expectedNonce,keccak256(data));
    }
    function withdraw(address asset,uint112 amount) external controller nonReentrant{_amount(amount);_mark('WITHDRAW',abi.encode(asset,amount));ProtocolAssets.push(asset,address(root),amount);}
    /// @notice Explicitly isolate an unreadable token. Its unresolved claim stays in every snapshot.
    /// Quarantine never clears approvals or proves solvency. Adapter input/output is disabled;
    /// the controller retains withdraw-to-root recovery if the token allows transfers.
    function quarantine(address asset,bytes32 evidence) external controller nonReentrant {
        (bool readable,)=_tryBalance(asset);
        if(asset==address(0)||!isTracked[asset]||assetState[asset]!=0||readable||evidence==0)revert BadEffect();
        assetState[asset]=1;assetEvidence[asset]=evidence;_health(asset,1,evidence);
    }
    function restore(address asset) external controller nonReentrant {
        if(!isTracked[asset]||assetState[asset]!=1)revert BadEffect();_balance(asset);
        assetState[asset]=0;_health(asset,0,assetEvidence[asset]);
    }
    /// @notice Frees a tracking slot only for a readable zero balance; history remains committed.
    function retire(address asset) external controller nonReentrant {
        if(asset==address(0)||!isTracked[asset]||assetState[asset]!=0||_balance(asset)!=0)revert BadEffect();
        for(uint256 i;i<tracked.length;++i)if(tracked[i]==asset){tracked[i]=tracked[tracked.length-1];tracked.pop();break;}
        isTracked[asset]=false;assetState[asset]=2;
        retiredHistory=keccak256(abi.encode(retiredHistory,asset,asset.codehash,block.number));_health(asset,2,retiredHistory);
    }
    function assetStatus(address asset) external view returns(bool tracked_,uint8 state,bool readable,uint256 balance,bytes32 evidence,bytes32 codeHash){
        (readable,balance)=_tryBalance(asset);return(isTracked[asset],assetState[asset],readable,balance,assetEvidence[asset],asset.codehash);
    }
    function unresolvedAssets() external view returns(uint256 count){for(uint256 i;i<tracked.length;++i){(bool ok,)=_tryBalance(tracked[i]);if(!ok||assetState[tracked[i]]==1)++count;}}
    function _health(address asset,uint8 state,bytes32 evidence) private{_mark('ASSET_HEALTH',abi.encode(asset,state,evidence,asset.codehash));emit AssetHealthChanged(asset,state,evidence,asset.codehash);}
    function _track(address asset) private{
        if(assetState[asset]==1)revert BadEffect();
        if(!isTracked[asset]){if(tracked.length>=32||asset.code.length==0)revert BadEffect();_balance(asset);isTracked[asset]=true;assetState[asset]=0;tracked.push(asset);}
    }
    function _mark(bytes32 kind,bytes memory data) private{revision=keccak256(abi.encode(revision,kind,data));}
    function _balance(address asset) private view returns(uint256 value){(bool ok,uint256 amount)=_tryBalance(asset);if(!ok)revert BadEffect();return amount;}
    function _tryBalance(address asset) private view returns(bool ok,uint256 value){
        if(asset==address(0))return(true,address(this).balance);
        if(asset.code.length==0)return(false,0);
        bytes memory input=abi.encodeWithSignature("balanceOf(address)",address(this));uint256 size;
        assembly("memory-safe"){
            let output:=mload(0x40)
            ok:=staticcall(50000,asset,add(input,32),mload(input),output,32)
            size:=returndatasize()
            value:=mload(output)
        }
        if(!ok||size!=32)return(false,0);
    }
    function snapshot() external view returns(bytes32 h){
        h=keccak256(abi.encode(address(this),address(root),revision,nonce,retiredHistory));
        for(uint256 i;i<tracked.length;++i){address asset=tracked[i];(bool readable,uint256 amount)=_tryBalance(asset);
            h=keccak256(abi.encode(h,asset,asset.codehash,assetState[asset],readable,amount,assetEvidence[asset]));}
    }

}
contract ExperimentCellFactory {
    mapping(address=>address) public cellOf;
    event CellCreated(address indexed account,address indexed cell);
    function create() external returns(address c){IOperatingAccount a=IOperatingAccount(msg.sender);require(msg.sender.code.length!=0&&a.mode()==0&&a.currentOwner()!=address(0),'ACCOUNT_REQUIRED');require(cellOf[msg.sender]==address(0),'ALREADY_CREATED');c=address(new ExperimentCell(msg.sender));cellOf[msg.sender]=c;emit CellCreated(msg.sender,c);}
    function accountCommitment(address account) external view returns(bytes32){address c=cellOf[account];return c==address(0)?bytes32(0):ExperimentCell(payable(c)).snapshot();}
}
