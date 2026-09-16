// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {OFT} from '@layerzerolabs/oft-evm/contracts/OFT.sol';
import {EndpointV2} from '@layerzerolabs/lz-evm-protocol-v2/contracts/EndpointV2.sol';
import {SimpleMessageLib} from '@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/SimpleMessageLib.sol';
import {PacketV1Codec} from '@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/libs/PacketV1Codec.sol';
import {Origin} from '@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol';
import {TimeVault} from '../../contracts/src/protocol/TimeVault.sol';
contract FixtureOFT is OFT {
 constructor(address endpoint_) OFT('ANIMA Bridge Test','ABT',endpoint_,msg.sender) {}
 function mint(address recipient,uint256 amount) external onlyOwner {_mint(recipient,amount);}
}
contract BridgeLedgerFixture {
 bool public isSealed=true;
 address public collection=address(this);
 function setSealed(bool value) external {isSealed=value;}
 function record(uint8,address,uint256,address,uint256,uint256,bytes32) external {}
}
contract PacketDecoder {
 using PacketV1Codec for bytes;
 function decode(bytes calldata packet) external pure returns(Origin memory,address,bytes32,bytes memory){return (Origin(packet.srcEid(),packet.sender(),packet.nonce()),packet.receiverB20(),packet.guid(),packet.message());}
}
