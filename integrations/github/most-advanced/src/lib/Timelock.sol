// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  TIMELOCK — a delay between an intention and its effect

  Every privileged path in this system is meant to end up here. Not because
  a delay makes a bad change good, but because it makes a bad change
  *visible* before it lands. The threat model is not a dishonest curator so
  much as a stolen key: without a delay, a compromised key is an instant
  loss and the first anyone knows of it is afterwards. With one, the same
  compromise is a queued transaction sitting in public for a week with an
  event announcing exactly what it will do.

  Adapted from the Dave Held core, with three changes:

    · admin is mutable, but only through this contract's own queue. An
      immutable admin cannot be rotated when the multisig behind it needs
      to change; an admin that can rotate itself instantly is not a
      timelock at all. So rotation is a queued operation like any other.

    · queued operations expire. Without a grace period a proposal sits
      executable forever, and an operation queued and forgotten a year ago
      is a live weapon for whoever eventually takes the key.

    · queue refuses to re-queue an operation that is already pending, so
      an eta cannot be quietly pushed around underneath a watcher.

  What it deliberately does not have: roles, guardians, a veto council, or
  any second address that can cancel. Every one of those is another key to
  steal. One admin, one delay, one public queue.
───────────────────────────────────────────────────────────────────────────*/
contract Timelock {
    /// @dev Long enough that a compromise is noticed and a market can exit.
    uint256 public constant DELAY = 7 days;
    /// @dev After this, a queued operation is dead and must be re-proposed.
    uint256 public constant GRACE = 14 days;

    address public admin;
    mapping(bytes32 => uint256) public eta;

    event Queued(bytes32 indexed op, address target, uint256 value, bytes data, uint256 eta);
    event Executed(bytes32 indexed op, address target, uint256 value, bytes data);
    event Cancelled(bytes32 indexed op);
    event AdminChanged(address indexed from, address indexed to);

    error NotAdmin();
    error NotSelf();
    error NotQueued();
    error AlreadyQueued();
    error TooEarly();
    error Expired();
    error CallFailed(bytes reason);
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        emit AdminChanged(address(0), admin_);
    }

    function opHash(address target, uint256 value, bytes calldata data, bytes32 salt)
        public pure returns (bytes32)
    {
        return keccak256(abi.encode(target, value, data, salt));
    }

    function queue(address target, uint256 value, bytes calldata data, bytes32 salt)
        external onlyAdmin returns (bytes32 op)
    {
        op = opHash(target, value, data, salt);
        if (eta[op] != 0) revert AlreadyQueued();
        uint256 when = block.timestamp + DELAY;
        eta[op] = when;
        // the full calldata goes in the log: a queue nobody can read is not
        // a warning, it is a formality
        emit Queued(op, target, value, data, when);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external payable onlyAdmin returns (bytes memory out)
    {
        bytes32 op = opHash(target, value, data, salt);
        uint256 t = eta[op];
        if (t == 0) revert NotQueued();
        if (block.timestamp < t) revert TooEarly();
        if (block.timestamp > t + GRACE) revert Expired();

        delete eta[op];                       // effects before interaction

        bool ok;
        (ok, out) = target.call{value: value}(data);
        if (!ok) revert CallFailed(out);
        emit Executed(op, target, value, data);
    }

    function cancel(bytes32 op) external onlyAdmin {
        if (eta[op] == 0) revert NotQueued();
        delete eta[op];
        emit Cancelled(op);
    }

    /// @notice Rotate the admin. Only reachable by queueing a call to this
    ///         contract, so it takes the same seven days as anything else.
    function setAdmin(address next) external {
        if (msg.sender != address(this)) revert NotSelf();
        if (next == address(0)) revert ZeroAddress();
        emit AdminChanged(admin, next);
        admin = next;
    }

    /// @notice Whether an operation is executable in this block.
    function ready(bytes32 op) external view returns (bool) {
        uint256 t = eta[op];
        return t != 0 && block.timestamp >= t && block.timestamp <= t + GRACE;
    }

    receive() external payable {}
}
