// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {SignatureChecker} from "../../lib/Crypto.sol";
import {AgentCommerce} from "./AgentCommerce.sol";

/// @notice Open signed directory with attributable, once-per-client-job feedback.
/// @dev ANIMA-native directory, not an ERC-8004 registry. External ERC-8004 IDs are hints only.
///      Signatures authenticate a wallet, not an endpoint, person, capability or quality claim.
contract ProviderDirectory {
    struct Provider {bytes32 metadataHash;string uri;bytes32 capabilities;uint64 revision;uint48 validUntil;bool active;}
    bytes32 public constant REGISTRATION_TYPEHASH=keccak256("Provider(address provider,bytes32 metadataHash,bytes32 uriHash,bytes32 capabilities,uint256 nonce,uint48 validUntil,bool active)");
    bytes32 public immutable DOMAIN_SEPARATOR;
    AgentCommerce public immutable commerce;
    mapping(address=>Provider) private records;
    mapping(address=>uint256) public nonces;
    address[] public providers;
    mapping(address=>bool) private known;
    mapping(uint256=>bool) public reviewed;
    struct Feedback {address provider;address reviewer;int8 score;bytes32 evidence;bool revoked;}
    mapping(uint256=>Feedback) public feedback;
    event ProviderUpdated(address indexed provider,bytes32 indexed metadataHash,bytes32 capabilities,uint64 revision,bool active,string uri);
    event FeedbackGiven(uint256 indexed jobId,address indexed provider,address indexed reviewer,int8 score,bytes32 evidence);
    event FeedbackRevoked(uint256 indexed jobId,address indexed reviewer);
    error InvalidRegistration(); error InvalidFeedback(); error Unauthorized();
    constructor(address commerce_){if(commerce_.code.length==0)revert InvalidRegistration();commerce=AgentCommerce(commerce_);DOMAIN_SEPARATOR=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("ANIMA Provider Directory"),keccak256("1"),block.chainid,address(this)));}
    function registrationDigest(address provider,bytes32 metadataHash,string calldata uri,bytes32 capabilities,uint256 nonce,uint48 validUntil,bool active) public view returns(bytes32){return keccak256(abi.encodePacked("\x19\x01",DOMAIN_SEPARATOR,keccak256(abi.encode(REGISTRATION_TYPEHASH,provider,metadataHash,keccak256(bytes(uri)),capabilities,nonce,validUntil,active))));}
    function register(address provider,bytes32 metadataHash,string calldata uri,bytes32 capabilities,uint256 nonce,uint48 validUntil,bool active,bytes calldata signature) external {
        if(provider==address(0)||metadataHash==0||bytes(uri).length==0||bytes(uri).length>2048||validUntil<=block.timestamp||nonce!=nonces[provider])revert InvalidRegistration();
        if(!SignatureChecker.isValidSignatureNow(provider,registrationDigest(provider,metadataHash,uri,capabilities,nonce,validUntil,active),signature))revert Unauthorized();
        nonces[provider]=nonce+1;uint64 revision=records[provider].revision+1;records[provider]=Provider(metadataHash,uri,capabilities,revision,validUntil,active);
        if(!known[provider]){known[provider]=true;providers.push(provider);}
        emit ProviderUpdated(provider,metadataHash,capabilities,revision,active,uri);
    }
    function giveFeedback(uint256 jobId,int8 score,bytes32 evidence) external {
        AgentCommerce.Job memory j=commerce.jobs(jobId);
        if(j.id==0||j.client!=msg.sender||j.provider==msg.sender)revert Unauthorized();
        if((j.status!=AgentCommerce.JobStatus.Completed&&j.status!=AgentCommerce.JobStatus.Rejected&&j.status!=AgentCommerce.JobStatus.Expired)||j.budget==0||score< -5||score>5||evidence==0||reviewed[jobId])revert InvalidFeedback();
        // An unfunded cancelled offer must not manufacture a reputation history.
        if(!commerce.wasFunded(jobId))revert InvalidFeedback();
        reviewed[jobId]=true;feedback[jobId]=Feedback(j.provider,msg.sender,score,evidence,false);emit FeedbackGiven(jobId,j.provider,msg.sender,score,evidence);
    }
    function revokeFeedback(uint256 jobId) external {Feedback storage f=feedback[jobId];if(f.reviewer!=msg.sender)revert Unauthorized();if(f.revoked)revert InvalidFeedback();f.revoked=true;emit FeedbackRevoked(jobId,msg.sender);}
    function provider(address who) external view returns(Provider memory){return records[who];}
    function count() external view returns(uint256){return providers.length;}
    function list(uint256 start,uint256 limit) external view returns(address[] memory result){if(limit>100)limit=100;uint256 end=start+limit;if(end>providers.length)end=providers.length;if(start>=end)return new address[](0);result=new address[](end-start);for(uint256 i=start;i<end;++i)result[i-start]=providers[i];}
}
