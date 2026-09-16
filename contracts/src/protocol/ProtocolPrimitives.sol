// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProtocolCollection {
    function accountOf(uint256 id) external view returns (address);
    function ownerOf(uint256 id) external view returns (address);
}

interface IWorldLedger {
    function collection() external view returns (address);
    function market() external view returns (address);
    function vault() external view returns (address);
    function launchpad() external view returns (address);
    function isSealed() external view returns (bool);
    function record(uint8 kind,address actor,uint256 identity,address asset,uint256 amount,uint256 referenceId,bytes32 detail) external;
    function createLaunchRoom(address creator,address token,string calldata title) external returns(uint256);
}

/// @dev No delegatecall, no native-token/ERC20 dual representation, no silent false returns.
library ProtocolAssets {
    error BadAsset(); error TransferFailed(); error UnsupportedTransfer();
    uint256 internal constant MAX_AMOUNT = type(uint112).max;
    function balance(address token,address who) internal view returns(uint256 result) {
        if(token == address(0)) return who.balance;
        (bool ok,bytes memory ret)=token.staticcall(abi.encodeWithSelector(bytes4(0x70a08231),who));
        if(!ok || ret.length!=32) revert BadAsset();
        result=abi.decode(ret,(uint256));
    }
    function invoke(address token,bytes memory data) internal {
        if(token.code.length==0) revert BadAsset();
        (bool ok,bytes memory ret)=token.call(data);
        if(!ok || (ret.length!=0 && (ret.length!=32 || !abi.decode(ret,(bool))))) revert TransferFailed();
    }
    function pull(address token,address from,uint256 amount) internal {
        if(token==address(0) || amount==0 || amount>MAX_AMOUNT) revert BadAsset();
        uint256 beforeBalance=balance(token,address(this));
        uint256 beforeFrom=balance(token,from);
        invoke(token,abi.encodeWithSelector(bytes4(0x23b872dd),from,address(this),amount));
        if(balance(token,address(this))!=beforeBalance+amount || balance(token,from)+amount!=beforeFrom) revert UnsupportedTransfer();
    }
    function push(address token,address to,uint256 amount) internal {
        if(to==address(0) || to==address(this)) revert BadAsset();
        if(token==address(0)) {
            (bool ok,)=payable(to).call{value:amount}("");
            if(!ok) revert TransferFailed();
        } else {
            uint256 beforeTo=balance(token,to); uint256 beforeBalance=balance(token,address(this));
            invoke(token,abi.encodeWithSelector(bytes4(0xa9059cbb),to,amount));
            if(balance(token,to)!=beforeTo+amount || balance(token,address(this))+amount!=beforeBalance) revert UnsupportedTransfer();
        }
    }
    function approveExact(address token,address spender,uint256 amount) internal {
        invoke(token,abi.encodeWithSelector(bytes4(0x095ea7b3),spender,0));
        if(amount!=0) invoke(token,abi.encodeWithSelector(bytes4(0x095ea7b3),spender,amount));
    }
}

abstract contract ProtocolGuard {
    uint256 private entered=1;
    error Reentered(); error InvalidIdentity(); error InvalidAmount(); error InvalidTime(); error Unauthorized();
    modifier nonReentrant(){if(entered!=1) revert Reentered(); entered=2; _; entered=1;}
    function _identity(address collection,address actor,uint256 identity) internal view {
        // Zero means an unbound wallet/contract address, never a claimed NFT identity.
        if(identity!=0 && IProtocolCollection(collection).accountOf(identity)!=actor) revert InvalidIdentity();
    }
    function _amount(uint256 value) internal pure {
        if(value==0 || value>type(uint112).max) revert InvalidAmount();
    }
}
