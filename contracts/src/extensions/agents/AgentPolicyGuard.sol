// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IAgentScopedAccount {
    struct ActionGrant {bytes32 adoption;address caller;address target;address asset;bytes32 dataHash;bytes32 targetCodeHash;uint112 perCall;uint112 remaining;uint96 value;uint48 expires;uint64 epoch;uint32 callsRemaining;bool revoked;}
    function currentOwner() external view returns(address);
    function sessionEpoch() external view returns(uint64);
    function actionNonce() external view returns(uint256);
    function mode() external view returns(uint8);
    function actionGrant(uint256) external view returns(ActionGrant memory);
    function executeInstrument(uint256,uint256,bytes calldata) external returns(bytes memory);
}
/// @notice Schedules the account's exact-calldata, asset-budgeted permission.
/// No selector session or independent token allowance is granted to the worker.
contract AgentPolicyGuard {
    struct Grant {
        address account;address owner;address worker;address target;
        bytes32 dataHash;bytes32 targetCodeHash;bytes4 selector;
        uint96 value;uint112 remaining;uint48 validAfter;uint48 validUntil;
        uint48 lastRun;uint32 minInterval;uint32 callsRemaining;uint64 epoch;bool revoked;
        uint256 instrumentId;address asset;uint112 perCall;
    }
    uint256 public count;
    mapping(uint256=>Grant) private grants;
    mapping(address=>mapping(uint256=>bool)) public assigned;
    mapping(address=>bytes32) public auditRoot;
    bool private entered;
    event GrantCreated(uint256 indexed id,address indexed account,address indexed worker,uint256 instrumentId,address asset,uint112 budget);
    event GrantRevoked(uint256 indexed id);
    event ActionExecuted(uint256 indexed id,uint256 indexed nonce,address indexed worker,bytes32 resultHash,bytes32 auditRoot);
    error InvalidGrant();error Unauthorized();error ActionUnavailable();error Reentered();
    function grantBudgeted(address account,uint256 instrumentId,address worker,bytes calldata data,uint48 validAfter,uint32 minInterval) external returns(uint256 id) {
        IAgentScopedAccount a=IAgentScopedAccount(account);
        if(msg.sender!=a.currentOwner())revert Unauthorized();
        IAgentScopedAccount.ActionGrant memory g=a.actionGrant(instrumentId);
        if(a.mode()!=0||worker==address(0)||g.caller!=address(this)||g.revoked||g.epoch!=a.sessionEpoch()||g.expires<=block.timestamp||g.expires<=validAfter||g.callsRemaining==0||g.remaining==0||g.target==address(this)||g.target.codehash!=g.targetCodeHash||data.length<4||keccak256(data)!=g.dataHash||assigned[account][instrumentId])revert InvalidGrant();
        assigned[account][instrumentId]=true;id=++count;
        grants[id]=Grant(account,msg.sender,worker,g.target,g.dataHash,g.targetCodeHash,bytes4(data[:4]),g.value,g.remaining,validAfter,g.expires,0,minInterval,g.callsRemaining,g.epoch,false,instrumentId,g.asset,g.perCall);
        emit GrantCreated(id,account,worker,instrumentId,g.asset,g.remaining);
    }
    function revoke(uint256 id) external {
        Grant storage g=grants[id];
        if(g.account==address(0)||msg.sender!=IAgentScopedAccount(g.account).currentOwner())revert Unauthorized();
        g.revoked=true;emit GrantRevoked(id);
    }
    function run(uint256 id,uint256 expectedNonce,bytes calldata data) external returns(bytes memory result) {
        if(entered)revert Reentered();entered=true;
        Grant storage g=grants[id];
        if(msg.sender!=g.worker)revert Unauthorized();
        IAgentScopedAccount a=IAgentScopedAccount(g.account);
        if(g.revoked||block.timestamp<g.validAfter||block.timestamp>=g.validUntil||
            (g.lastRun!=0&&block.timestamp<uint256(g.lastRun)+g.minInterval)||g.target.codehash!=g.targetCodeHash||keccak256(data)!=g.dataHash||
            a.currentOwner()!=g.owner||a.sessionEpoch()!=g.epoch||a.mode()!=0||a.actionNonce()!=expectedNonce)revert ActionUnavailable();
        g.lastRun=uint48(block.timestamp);
        result=a.executeInstrument(g.instrumentId,expectedNonce,data);
        if(a.currentOwner()!=g.owner||a.sessionEpoch()!=g.epoch||a.mode()!=0||a.actionNonce()!=expectedNonce+1)revert ActionUnavailable();
        IAgentScopedAccount.ActionGrant memory actual=a.actionGrant(g.instrumentId);
        g.remaining=actual.remaining;g.callsRemaining=actual.callsRemaining;
        bytes32 h=keccak256(abi.encode(auditRoot[g.account],block.chainid,address(this),id,expectedNonce,msg.sender,g.target,g.asset,g.dataHash,g.remaining,keccak256(result),block.number));
        auditRoot[g.account]=h;emit ActionExecuted(id,expectedNonce,msg.sender,keccak256(result),h);entered=false;
    }
    function getGrant(uint256 id) external view returns(Grant memory g){
        g=grants[id];if(g.account==address(0))return g;
        IAgentScopedAccount.ActionGrant memory a=IAgentScopedAccount(g.account).actionGrant(g.instrumentId);
        g.remaining=a.remaining;g.callsRemaining=a.callsRemaining;g.revoked=g.revoked||a.revoked;
    }
}
