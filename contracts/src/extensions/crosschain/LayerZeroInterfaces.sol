// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Exact ABI subset of @layerzerolabs/oft-evm 4.0.1 IOFT and Endpoint v2
// messaging structs. Upstream MIT interfaces; source links and pins are recorded
// in packages/crosschain/package-lock.json and docs/CROSSCHAIN.md.
struct SendParam { uint32 dstEid; bytes32 to; uint256 amountLD; uint256 minAmountLD; bytes extraOptions; bytes composeMsg; bytes oftCmd; }
struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }
struct MessagingReceipt { bytes32 guid; uint64 nonce; MessagingFee fee; }
struct OFTReceipt { uint256 amountSentLD; uint256 amountReceivedLD; }
interface IAnimaOFT {
    function token() external view returns(address);
    function endpoint() external view returns(address);
    function peers(uint32) external view returns(bytes32);
    function approvalRequired() external view returns(bool);
    function quoteSend(SendParam calldata,bool) external view returns(MessagingFee memory);
    function send(SendParam calldata,MessagingFee calldata,address) external payable returns(MessagingReceipt memory,OFTReceipt memory);
}
interface IBridgeToken {
    function balanceOf(address) external view returns(uint256);
    function allowance(address,address) external view returns(uint256);
}
library BridgeToken {
    function callToken(address token, bytes memory data) internal {
        (bool ok,bytes memory result)=token.call(data);
        require(ok && (result.length==0 || (result.length==32 && abi.decode(result,(bool)))),"TOKEN_CALL_FAILED");
    }
    function pull(address token,address from,uint256 amount) internal { callToken(token,abi.encodeWithSignature("transferFrom(address,address,uint256)",from,address(this),amount)); }
    function push(address token,address to,uint256 amount) internal { if(amount!=0)callToken(token,abi.encodeWithSignature("transfer(address,uint256)",to,amount)); }
    function approve(address token,address to,uint256 amount) internal { callToken(token,abi.encodeWithSignature("approve(address,uint256)",to,0)); if(amount!=0)callToken(token,abi.encodeWithSignature("approve(address,uint256)",to,amount)); }
}

struct BridgeAction {
    address recipient;
    uint256 minimumReceived;
    uint112 lockAmount;
    uint64 deadline;
    uint64 start;
    uint64 cliff;
    uint64 end;
    bool linear;
}
