// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SSTORE2} from "../src/lib/SSTORE2.sol";
import {RefField} from "./RefField.sol";

/*───────────────────────────────────────────────────────────────────────────
  PLATE — pay for an image to exist, not for the work of making it

  The compute is free: a phone draws this frame in sixteen milliseconds and
  nobody needs paying for it. What is not free is the frame still being
  there in twenty years at an address no company owns. So this market does
  not buy rendering. It buys permanence, and it buys the guarantee that the
  bytes are the right bytes.

  Anybody may render. Anybody may post. Correctness is not asserted by a
  committee, it is *refuted* by anybody willing to spend one transaction:
  a challenger names one pixel, proves it is under the posted root, and the
  chain recomputes that pixel from the fixed-point reference field. If they
  disagree the poster's bond goes to the challenger and the job reopens.

  What this cannot do, and says so: the pixel it recomputes is the FIXED
  POINT reference, not what any GPU drew. GLSL is not reproducible across
  drivers, so nothing on chain can ever certify a screenshot. A Plate is
  the collection's own canonical print — the only image of a token whose
  every pixel is a fact rather than a rendering.
───────────────────────────────────────────────────────────────────────────*/

contract Assay is RefField {
    /// @notice A pinhole camera, so a pixel index means the same thing to
    ///         the poster and to the chain. Deterministic in every argument.
    function ray(bytes32 params, uint32 x, uint32 y, uint32 w, uint32 h)
        public pure
        returns (int256 ox, int256 oy, int256 oz, int256 dx, int256 dy, int256 dz)
    {
        int256 u = (int256(uint256(x)) * 2 * ONE) / int256(uint256(w)) - ONE;
        int256 v = (int256(uint256(y)) * 2 * ONE) / int256(uint256(h)) - ONE;
        ox = int256(uint256(params) & 0xffff) * 1e12;   // the token's own word
        oy = 0;
        oz = -3 * ONE;
        int256 l = len3(u, v, ONE);
        dx = (u * ONE) / l;
        dy = (v * ONE) / l;
        dz = (ONE * ONE) / l;
    }

    /// @notice What that pixel is. The only opinion this system has.
    function pixelAt(bytes32 params, uint32 x, uint32 y, uint32 w, uint32 h, uint256 steps)
        public pure returns (bytes32)
    {
        (int256 ox, int256 oy, int256 oz, int256 dx, int256 dy, int256 dz) = ray(params, x, y, w, h);
        return bytes32(uint256(pixelTier3(steps, ox, oy, oz, dx, dy, dz)));
    }
}

contract Plate {
    Assay public immutable ASSAY;

    uint64 public constant MIN_WINDOW = 6 hours;
    uint64 public constant MAX_WINDOW = 30 days;
    /// @dev The bond must be worth more than the gas a challenge costs, or
    ///      nobody bothers and the window is decoration. One pixel of this
    ///      field is under five million gas; a hundred times that in bond is
    ///      still small against the reward.
    uint96 public constant MIN_BOND = 0.002 ether;

    struct Job {
        address funder;
        uint96  reward;
        bytes32 params;      // the render inputs, hashed: word, seed, camera
        uint32  width;
        uint32  height;
        uint32  steps;
        uint64  closesAt;    // the funder's deadline for anyone to post
        address poster;
        uint96  bond;
        bytes32 root;
        uint64  postedAt;
        bool    paid;
    }
    mapping(bytes32 => Job) internal _job;
    mapping(bytes32 => address[]) internal _shards;
    mapping(address => uint256) public owed;
    uint256 public jobs;

    event Commissioned(bytes32 indexed job, address indexed funder, uint96 reward, bytes32 params, uint32 w, uint32 h);
    event Posted(bytes32 indexed job, address indexed poster, bytes32 root, uint256 bytes_, uint256 shards);
    event Refuted(bytes32 indexed job, address indexed by, uint32 x, uint32 y, bytes32 claimed, bytes32 truth);
    event Awarded(bytes32 indexed job, address indexed poster, uint256 reward);
    event Withdrawn(address indexed who, uint256 amount);

    error NoJob(); error Closed(); error Taken(); error NotPosted(); error StillOpen();
    error BondTooSmall(); error BadWindow(); error AlreadyPaid(); error BadProof();
    error ItAgrees(); error NothingOwed(); error PayFailed(); error Reentrancy();

    uint256 private _g = 1;
    modifier once() { if (_g != 1) revert Reentrancy(); _g = 2; _; _g = 1; }

    constructor(Assay a) { ASSAY = a; }

    /// @notice Put money behind an image that does not exist yet.
    function commission(bytes32 params, uint32 w, uint32 h, uint32 steps, uint64 window)
        external payable returns (bytes32 job)
    {
        if (window < MIN_WINDOW || window > MAX_WINDOW) revert BadWindow();
        unchecked { job = keccak256(abi.encode(block.chainid, address(this), jobs++)); }
        _job[job] = Job({
            funder: msg.sender, reward: uint96(msg.value), params: params,
            width: w, height: h, steps: steps,
            closesAt: uint64(block.timestamp) + window,
            poster: address(0), bond: 0, root: bytes32(0), postedAt: 0, paid: false
        });
        emit Commissioned(job, msg.sender, uint96(msg.value), params, w, h);
    }

    /// @notice Post the frame and stand behind it. The bytes go in as
    ///         contract code; the root is over the pixels, in row order.
    function post(bytes32 job, bytes32 root, bytes calldata chunk)
        external payable
    {
        Job storage J = _job[job];
        if (J.funder == address(0)) revert NoJob();
        if (J.poster != address(0)) revert Taken();
        if (block.timestamp > J.closesAt) revert Closed();
        if (msg.value < MIN_BOND) revert BondTooSmall();

        _shards[job].push(SSTORE2.write(chunk));
        J.poster = msg.sender;
        J.bond = uint96(msg.value);
        J.root = root;
        J.postedAt = uint64(block.timestamp);
        emit Posted(job, msg.sender, root, chunk.length, 1);
    }

    /// @notice A frame wider than one shard arrives in pieces. Only the
    ///         poster may add to their own, and only before it is paid.
    function addShard(bytes32 job, bytes calldata chunk) external {
        Job storage J = _job[job];
        if (J.poster != msg.sender) revert NotPosted();
        if (J.paid) revert AlreadyPaid();
        _shards[job].push(SSTORE2.write(chunk));
        emit Posted(job, msg.sender, J.root, chunk.length, _shards[job].length);
    }

    /// @notice Refute one pixel. Cheaper than trusting anybody.
    /// @dev    The proof is index-ordered, not sorted: a sorted proof lets a
    ///         leaf be moved to another position under the same root, which
    ///         is exactly the substitution this is trying to catch.
    function challenge(bytes32 job, uint32 x, uint32 y, bytes32 claimed, bytes32[] calldata proof)
        external once
    {
        Job storage J = _job[job];
        if (J.poster == address(0)) revert NotPosted();
        if (J.paid) revert AlreadyPaid();

        uint256 index = uint256(y) * uint256(J.width) + uint256(x);
        bytes32 h = keccak256(abi.encode(index, claimed));
        for (uint256 i; i < proof.length; ++i) {
            h = (index & 1 == 0)
                ? keccak256(abi.encode(h, proof[i]))
                : keccak256(abi.encode(proof[i], h));
            index >>= 1;
        }
        if (h != J.root) revert BadProof();

        bytes32 truth = ASSAY.pixelAt(J.params, x, y, J.width, J.height, J.steps);
        if (truth == claimed) revert ItAgrees();

        uint96 bond = J.bond;
        address poster = J.poster;
        /*  The job reopens with the same money behind it: a refutation is
            not a reason for the funder to lose their commission.        */
        J.poster = address(0); J.bond = 0; J.root = bytes32(0); J.postedAt = 0;
        delete _shards[job];
        owed[msg.sender] += bond;
        emit Refuted(job, msg.sender, x, y, claimed, truth);
        poster;
    }

    /// @notice Nobody refuted it. The poster takes the reward and the bond.
    function award(bytes32 job) external {
        Job storage J = _job[job];
        if (J.poster == address(0)) revert NotPosted();
        if (J.paid) revert AlreadyPaid();
        if (block.timestamp < uint256(J.postedAt) + MIN_WINDOW) revert StillOpen();
        J.paid = true;
        uint256 v = uint256(J.reward) + uint256(J.bond);
        owed[J.poster] += v;
        emit Awarded(job, J.poster, v);
    }

    function withdraw() external once {
        uint256 v = owed[msg.sender];
        if (v == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: v}("");
        if (!ok) revert PayFailed();
        emit Withdrawn(msg.sender, v);
    }

    function jobOf(bytes32 job) external view returns (Job memory) { return _job[job]; }
    function shardsOf(bytes32 job) external view returns (address[] memory) { return _shards[job]; }

    /// @notice The frame, whole, from contract code. No gateway, no server.
    function frame(bytes32 job) external view returns (bytes memory out) {
        address[] memory s = _shards[job];
        for (uint256 i; i < s.length; ++i) out = bytes.concat(out, SSTORE2.read(s[i]));
    }
}
