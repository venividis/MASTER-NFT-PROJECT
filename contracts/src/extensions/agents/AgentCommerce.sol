// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets,ProtocolGuard} from "../../protocol/ProtocolPrimitives.sol";

/// @notice Minimal non-hooked ERC-8183 draft lifecycle (specification retrieved 2026-09-12).
/// @dev Fixed standard ERC20, no fees, forwarding, upgrade administrator or arbitrary callbacks.
///      Explicit evaluator trust. A deliverable hash proves neither quality nor authorship.
contract AgentCommerce is ProtocolGuard {
    enum JobStatus {Open,Funded,Submitted,Completed,Rejected,Expired}
    struct Job {uint256 id;address client;address provider;address evaluator;string description;uint256 budget;uint256 expiredAt;JobStatus status;address hook;}
    address public immutable paymentToken;
    uint256 public jobCounter;
    mapping(uint256=>Job) private records;
    mapping(uint256=>bytes32) public deliverables;
    mapping(uint256=>bytes32) public attestations;
    mapping(uint256=>bool) public wasFunded;
    event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiredAt,address hook);
    event ProviderSet(uint256 indexed jobId,address indexed provider);
    event BudgetSet(uint256 indexed jobId,uint256 amount);
    event JobFunded(uint256 indexed jobId,address indexed client,uint256 amount);
    event JobSubmitted(uint256 indexed jobId,address indexed provider,bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId,address indexed evaluator,bytes32 reason);
    event JobRejected(uint256 indexed jobId,address indexed rejector,bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    error InvalidJob(); error UnsupportedHook();
    constructor(address token){if(token.code.length==0)revert InvalidJob();paymentToken=token;}
    function createJob(address provider,address evaluator,uint256 expiredAt,string calldata description,address hook) external returns(uint256 id){
        if(evaluator==address(0)||expiredAt<=block.timestamp||bytes(description).length>8192)revert InvalidJob();
        if(hook!=address(0))revert UnsupportedHook();
        id=++jobCounter;records[id]=Job(id,msg.sender,provider,evaluator,description,0,expiredAt,JobStatus.Open,address(0));
        emit JobCreated(id,msg.sender,provider,evaluator,expiredAt,address(0));
    }
    function setProvider(uint256 id,address provider) external {
        Job storage j=_job(id);if(msg.sender!=j.client)revert Unauthorized();
        if(j.status!=JobStatus.Open||j.provider!=address(0)||provider==address(0))revert InvalidJob();
        j.provider=provider;emit ProviderSet(id,provider);
    }
    function setBudget(uint256 id,uint256 amount) external {
        Job storage j=_job(id);if(msg.sender!=j.client&&msg.sender!=j.provider)revert Unauthorized();
        if(j.status!=JobStatus.Open||amount>type(uint112).max)revert InvalidJob();j.budget=amount;emit BudgetSet(id,amount);
    }
    function fund(uint256 id,uint256 expectedBudget) external nonReentrant {
        Job storage j=_job(id);if(msg.sender!=j.client)revert Unauthorized();
        if(j.status!=JobStatus.Open||j.provider==address(0)||j.budget==0||j.budget!=expectedBudget||block.timestamp>=j.expiredAt)revert InvalidJob();
        j.status=JobStatus.Funded;wasFunded[id]=true;ProtocolAssets.pull(paymentToken,msg.sender,j.budget);emit JobFunded(id,msg.sender,j.budget);
    }
    function submit(uint256 id,bytes32 deliverable) external {
        Job storage j=_job(id);if(msg.sender!=j.provider)revert Unauthorized();
        if(j.status!=JobStatus.Funded||block.timestamp>=j.expiredAt)revert InvalidJob();
        j.status=JobStatus.Submitted;deliverables[id]=deliverable;emit JobSubmitted(id,msg.sender,deliverable);
    }
    function complete(uint256 id,bytes32 reason) external nonReentrant {
        Job storage j=_job(id);if(msg.sender!=j.evaluator)revert Unauthorized();
        if(j.status!=JobStatus.Submitted||block.timestamp>=j.expiredAt)revert InvalidJob();
        j.status=JobStatus.Completed;attestations[id]=reason;ProtocolAssets.push(paymentToken,j.provider,j.budget);emit JobCompleted(id,msg.sender,reason);
    }
    function reject(uint256 id,bytes32 reason) external nonReentrant {
        Job storage j=_job(id);bool funded=j.status==JobStatus.Funded||j.status==JobStatus.Submitted;
        if(j.status==JobStatus.Open){if(msg.sender!=j.client)revert Unauthorized();}else if(funded){if(msg.sender!=j.evaluator)revert Unauthorized();}else revert InvalidJob();
        j.status=JobStatus.Rejected;attestations[id]=reason;if(funded)ProtocolAssets.push(paymentToken,j.client,j.budget);emit JobRejected(id,msg.sender,reason);
    }
    function claimRefund(uint256 id) external nonReentrant {
        Job storage j=_job(id);if((j.status!=JobStatus.Funded&&j.status!=JobStatus.Submitted)||block.timestamp<j.expiredAt)revert InvalidJob();
        j.status=JobStatus.Expired;ProtocolAssets.push(paymentToken,j.client,j.budget);emit JobExpired(id);
    }
    function jobs(uint256 id) external view returns(Job memory){return records[id];}
    function _job(uint256 id) private view returns(Job storage j){j=records[id];if(j.id==0)revert InvalidJob();}
}
