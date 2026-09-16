// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IModuleArchive {
    function contentSha256() external view returns(bytes32);
    function byteLength() external view returns(uint256);
    function chunkCount() external view returns(uint256);
}

/// @notice Immutable, independently versioned feature archives and exact dependency versions.
/// @dev Root commitment excludes deployment addresses so identical feature bytes can be
/// reused across editions; every content digest and dependency version is still pinned.
/// Readers verify compressed and expanded bytes before executing ANY recovered code.
contract OnchainModuleDirectory {
    uint256 public constant schemaVersion=3;
    bytes32 public constant DOMAIN=sha256("anima.functional-runtime/1");
    struct Module {
        bytes32 id;
        uint32 version;
        address archive;
        uint8 archiveVersion;
        bytes32 digest;
        uint32 storedBytes;
        bytes32 expandedDigest;
        uint32 expandedBytes;
        uint16[] dependencies;
        uint32[] dependencyVersions;
    }
    Module[] private modules;
    bytes32[] private codeHashes;
    uint256 public immutable shellIndex;
    uint256 public immutable byteLength;
    uint256 public immutable expandedByteLength;
    bytes32 public immutable contentSha256;
    constructor(Module[] memory entries,uint256 shellIndex_,bytes32 expectedDigest){
        require(entries.length>1&&entries.length<=32&&shellIndex_<entries.length,"MODULE_COUNT");
        shellIndex=shellIndex_;uint256 stored;uint256 expanded;
        bytes memory commitment=abi.encode(DOMAIN,entries.length,shellIndex_);
        for(uint256 i;i<entries.length;i++){
            Module memory m=entries[i];require(m.id!=0&&m.version>0&&m.archive.code.length>0&&m.digest!=0&&m.expandedDigest!=0,"MODULE_IDENTITY");
            require(m.archiveVersion==1||m.archiveVersion==2,"MODULE_ARCHIVE_VERSION");
            require(m.dependencies.length==m.dependencyVersions.length&&m.dependencies.length<entries.length,"MODULE_DEPENDENCIES");
            for(uint256 j;j<i;j++)require(entries[j].id!=m.id,"DUPLICATE_MODULE");
            IModuleArchive a=IModuleArchive(m.archive);uint256 count=a.chunkCount();require(count>0&&count<=(m.archiveVersion==1?64:512)&&m.storedBytes>=count&&m.storedBytes<=count*23000&&m.expandedBytes>0,"MODULE_SIZE");
            require(a.contentSha256()==m.digest&&a.byteLength()==m.storedBytes,"MODULE_ARCHIVE_BINDING");
            if(m.archiveVersion==2){(bool ok,bytes memory v)=m.archive.staticcall(abi.encodeWithSignature("schemaVersion()"));require(ok&&v.length==32&&abi.decode(v,(uint256))==2,"MODULE_ARCHIVE_SCHEMA");}
            commitment=bytes.concat(commitment,abi.encode(m.id,uint256(m.version),uint256(m.archiveVersion),m.digest,uint256(m.storedBytes),m.expandedDigest,uint256(m.expandedBytes),m.dependencies.length));
            for(uint256 j;j<m.dependencies.length;j++){
                uint256 d=m.dependencies[j];require(d<entries.length&&d!=i&&entries[d].version==m.dependencyVersions[j],"MODULE_DEPENDENCY_VERSION");
                if(j!=0)require(m.dependencies[j-1]<d,"MODULE_DEPENDENCY_ORDER");
                commitment=bytes.concat(commitment,abi.encode(d,uint256(m.dependencyVersions[j])));
            }
            modules.push(m);codeHashes.push(m.archive.codehash);stored+=m.storedBytes;expanded+=m.expandedBytes;
        }
        require(stored<=64*1024*1024&&expanded<=64*1024*1024,"MODULE_TOTAL_SIZE");
        bytes32 digest=sha256(commitment);require(digest==expectedDigest,"MODULE_ROOT");contentSha256=digest;byteLength=stored;expandedByteLength=expanded;
    }
    function moduleCount() external view returns(uint256){return modules.length;}
    function moduleAt(uint256 index) external view returns(bytes32 id,uint32 version,address archive,uint8 archiveVersion,bytes32 digest,uint32 storedBytes,bytes32 expandedDigest,uint32 expandedBytes){
        Module storage m=modules[index];require(m.archive.codehash==codeHashes[index],"MODULE_CODE_CHANGED");return(m.id,m.version,m.archive,m.archiveVersion,m.digest,m.storedBytes,m.expandedDigest,m.expandedBytes);
    }
    function dependencyCount(uint256 index) external view returns(uint256){return modules[index].dependencies.length;}
    function dependencyAt(uint256 index,uint256 dependency) external view returns(uint16 moduleIndex,uint32 version){Module storage m=modules[index];return(m.dependencies[dependency],m.dependencyVersions[dependency]);}
}
