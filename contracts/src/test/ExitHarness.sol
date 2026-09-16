// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets} from '../protocol/ProtocolPrimitives.sol';
contract ExitCollectionMock { mapping(uint256=>address) public accountOf;function bind(uint256 id,address account) external{accountOf[id]=account;} }
contract ExitAccountMock {
 address public currentOwner;uint64 public sessionEpoch=1;uint8 public mode;bool public transferOnReceive;
 constructor(address who){currentOwner=who;}
 function change(address who) external{currentOwner=who;++sessionEpoch;}
 function flip(bool on) external{transferOnReceive=on;}
 receive() external payable{if(transferOnReceive)++sessionEpoch;}
 function run(address target,bytes calldata data) external payable returns(bytes memory){require(msg.sender==currentOwner);(bool ok,bytes memory result)=target.call{value:msg.value}(data);if(!ok){assembly('memory-safe'){revert(add(result,32),mload(result))}}return result;}
}
contract ExitMarketMock {
 uint8 public behavior;address public callback;bytes public payload;
 receive() external payable{}
 function configure(uint8 b,address cb,bytes calldata data) external{behavior=b;callback=cb;payload=data;}
 function swap(address input,address output,uint112 amount,uint112 minimum,uint48,uint256,uint64) external payable returns(uint256 received,uint256 lockId){
  if(input==address(0))require(msg.value==amount);else ProtocolAssets.pull(input,msg.sender,behavior==1?amount-1:amount);
  received=uint256(amount)*2;require(received>=minimum,'MINIMUM');
  if(callback!=address(0)){(bool ok,)=callback.call(payload);require(ok,'CALLBACK');}
  ProtocolAssets.push(output,msg.sender,received);
  if(behavior==2)++received;if(behavior==3)lockId=1;
 }
}
contract ExitNativeLedgerMock {
 address public collection;address public launchpad;address public vault;bool public isSealed=true;
 constructor(address c,address seeder){collection=c;launchpad=seeder;}
 function record(uint8,address,uint256,address,uint256,uint256,bytes32) external{}
}
contract MintSanctuaryHarness {
 uint256 public total;mapping(uint256=>address) public ownerOf;mapping(uint256=>address) public getApproved;
 event Transfer(address indexed from,address indexed to,uint256 indexed tokenId);
 function mint() external payable{_mint(msg.sender,1);}
 function mint(uint256 quantity) external payable{_mint(msg.sender,quantity);}
 function mint(address recipient,uint256 quantity) external payable{_mint(recipient,quantity);}
 function publicMint(uint256 quantity) external payable{_mint(msg.sender,quantity);}
 function safeMint(address recipient) external payable{_mint(recipient,1);}
 function _mint(address recipient,uint256 quantity) private {require(quantity>0&&quantity<=100);for(uint256 i;i<quantity;++i){ownerOf[++total]=recipient;emit Transfer(address(0),recipient,total);}}
 function safeTransferFrom(address from,address to,uint256 tokenId) external{require(msg.sender==from&&ownerOf[tokenId]==from);ownerOf[tokenId]=to;emit Transfer(from,to,tokenId);}
}
