// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A STOP byte followed by immutable data. Payload stays below EIP-170 runtime limits.
contract AppChunk {
    constructor(bytes memory payload){
        require(payload.length>0 && payload.length<=23000,"CHUNK_SIZE");
        bytes memory runtime=bytes.concat(hex"00",payload);
        assembly ("memory-safe"){return(add(runtime,32),mload(runtime))}
    }
}

/// @notice Immutable, complete HTML/Wasm/shader archive. Not a mutable URL or an IPFS-only pointer.
/// @dev Browsers still execute the recovered code offchain; storage being onchain is not execution.
contract OnchainApp {
    address[] public chunks;
    bytes32 public immutable contentSha256;
    uint256 public immutable byteLength;
    string public constant mimeType="text/html;charset=utf-8";
    constructor(address[] memory chunks_,bytes32 expectedSha){
        require(chunks_.length>0 && chunks_.length<=64,"CHUNK_COUNT");
        uint256 length;
        for(uint256 i;i<chunks_.length;++i){
            address chunk=chunks_[i];uint256 size=chunk.code.length;
            require(size>1 && size<=23001,"BAD_CHUNK");
            bytes memory first=new bytes(1);
            assembly ("memory-safe"){extcodecopy(chunk,add(first,32),0,1)}
            require(first[0]==0,"NOT_DATA_CODE");chunks.push(chunk);length+=size-1;
        }
        byteLength=length;bytes memory full=_assemble(length);
        require(sha256(full)==expectedSha,"SHA256_MISMATCH");contentSha256=expectedSha;
    }
    function chunkCount() external view returns(uint256){return chunks.length;}
    function readChunk(uint256 index) external view returns(bytes memory data){address chunk=chunks[index];uint256 size=chunk.code.length-1;data=new bytes(size);assembly ("memory-safe"){extcodecopy(chunk,add(data,32),1,size)}}
    function readAll() external view returns(bytes memory){return _assemble(byteLength);}
    function _assemble(uint256 length) private view returns(bytes memory data){
        data=new bytes(length);uint256 cursor;
        for(uint256 i;i<chunks.length;++i){address chunk=chunks[i];uint256 size=chunk.code.length-1;assembly ("memory-safe"){extcodecopy(chunk,add(add(data,32),cursor),1,size)}cursor+=size;}
    }
}
