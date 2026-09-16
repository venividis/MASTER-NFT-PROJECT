// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Each collection's deployment is published once, then cannot be edited.
contract GenesisManifest {
 address public immutable publisher;
 mapping(address=>address[6]) private _modules;
 constructor(){publisher=msg.sender;}
 function publish(address collection,address[6] calldata modules) external {
  require(msg.sender==publisher,"publisher only");require(collection.code.length>0,"collection required");
  require(_modules[collection][0]==address(0),"already sealed");
  for(uint256 i;i<6;++i)require(modules[i].code.length>0,"module required");
  _modules[collection]=modules;
 }
 /// @return modules Market, vault, memory ledger, world ledger, cartridges, vesting exits.
 function modulesOf(address collection) external view returns(address[6] memory modules){return _modules[collection];}
}
