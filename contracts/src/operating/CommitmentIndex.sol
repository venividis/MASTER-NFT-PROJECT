// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IAccountCommitment} from './OperatingInterfaces.sol';
/// @notice Immutable, bounded module roster for a NEW operating-market deployment.
/// @dev Snapshot detects changes in configured modules only, not all possible liabilities.
/// A module hash is not an asset valuation, nor proof of no external token allowances.
contract CommitmentIndex {
    address public immutable cellFactory;
    bytes32 public immutable cellFactoryCodeHash;
    address[] public modules;
    bytes32[] public moduleCodeHashes;
    error InvalidModule(); error UnavailableModule();
    constructor(address factory_,address[] memory modules_) {
        if(factory_.code.length==0)revert InvalidModule();cellFactory=factory_;cellFactoryCodeHash=factory_.codehash;
        if(modules_.length==0||modules_.length>16)revert InvalidModule();
        address previous;
        for(uint256 i;i<modules_.length;++i){address m=modules_[i];if(m<=previous||m.code.length==0)revert InvalidModule();previous=m;modules.push(m);moduleCodeHashes.push(m.codehash);}
    }
    function snapshot(address account) external view returns(bytes32 root) {
        if(cellFactory.codehash!=cellFactoryCodeHash)revert UnavailableModule();
        (bool found,bytes memory cellData)=cellFactory.staticcall{gas:50000}(abi.encodeWithSignature('cellOf(address)',account));
        if(!found||cellData.length!=32)revert UnavailableModule();address cell=abi.decode(cellData,(address));
        (bool cellOkRoot,bytes memory cellRoot)=cellFactory.staticcall{gas:500000}(abi.encodeCall(IAccountCommitment.accountCommitment,(account)));
        if(!cellOkRoot||cellRoot.length!=32)revert UnavailableModule();
        // Cell inventory is mandatory, even if the deployer omits the factory from modules.
        root=keccak256(abi.encode('IDFBI_COMMITMENT_INDEX_1_6',block.chainid,address(this),account,cell,abi.decode(cellRoot,(bytes32))));
        for(uint256 i;i<modules.length;++i){address m=modules[i];if(m.codehash!=moduleCodeHashes[i])revert UnavailableModule();
            (bool ok,bytes memory data)=m.staticcall{gas:250000}(abi.encodeCall(IAccountCommitment.accountCommitment,(account)));
            if(!ok||data.length!=32)revert UnavailableModule();
            root=keccak256(abi.encode(root,m,moduleCodeHashes[i],abi.decode(data,(bytes32))));
            if(cell!=address(0)){(bool cellOk,bytes memory cellState)=m.staticcall{gas:250000}(abi.encodeCall(IAccountCommitment.accountCommitment,(cell)));if(!cellOk||cellState.length!=32)revert UnavailableModule();root=keccak256(abi.encode(root,cell,abi.decode(cellState,(bytes32))));}
        }
    }
    function moduleCount() external view returns(uint256){return modules.length;}
}
