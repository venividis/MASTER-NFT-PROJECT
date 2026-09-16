// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {GenesisPayment, IGenesisToken} from '../src/GenesisV4Launchpad.sol';
/// @dev TEST ONLY. Exercises RelayAdapt's documented continue-after-failure accounting shape.
/// It is NOT RAILGUN, does not verify proofs and provides NO privacy.
contract RelayAccountingHarness {
 struct Call { address to; bytes data; uint256 value; }
 struct TokenData { uint8 tokenType; address tokenAddress; uint256 tokenSubID; }
 struct Preimage { bytes32 npk; TokenData token; uint120 value; }
 struct Ciphertext { bytes32[3] encryptedBundle; bytes32 shieldKey; }
 struct ShieldRequest { Preimage preimage; Ciphertext ciphertext; }
 address public immutable sink;bool private active;uint256 public failures;
 constructor(address s){sink=s;}
 function execute(address asset,uint256 amount,Call[] calldata calls,ShieldRequest[] calldata refunds) external {
  require(!active,'BUSY');active=true;GenesisPayment.pull(asset,msg.sender,address(this),amount);
  for(uint256 i;i<calls.length;i++){require(calls[i].to==address(this),'SELF');(bool ok,)=calls[i].to.call(calls[i].data);if(!ok)failures++;}
  this.shield(refunds);active=false;
 }
 function multicall(bool requireSuccess,Call[] calldata calls) external {
  require(msg.sender==address(this)&&active,'SELF');
  for(uint256 i;i<calls.length;i++){(bool ok,)=calls[i].to.call{value:calls[i].value}(calls[i].data);require(ok||!requireSuccess,'INNER_FAILURE');}
 }
 function shield(ShieldRequest[] calldata requests) external {
  require(msg.sender==address(this)&&active,'SELF');
  for(uint256 i;i<requests.length;i++){address t=requests[i].preimage.token.tokenAddress;GenesisPayment.transfer(t,sink,IGenesisToken(t).balanceOf(address(this)));}
 }
}
