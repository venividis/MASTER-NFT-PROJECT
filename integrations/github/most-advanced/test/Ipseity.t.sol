// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Engine} from "../src/Engine.sol";
import {Sigil} from "../src/Sigil.sol";
import {Renderer} from "../src/Renderer.sol";
import {Ipseity, IRenderer} from "../src/Ipseity.sol";
import {Section} from "../src/lib/Types.sol";
import {SSTORE2} from "../src/lib/SSTORE2.sol";
import {Trig} from "../src/lib/Trig.sol";
import {IpseityAccount} from "../src/IpseityAccount.sol";
import {GripVault} from "../src/GripVault.sol";
import {ERC6551Registry} from "./mocks/ERC6551Registry.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {MockReceiver} from "./mocks/MockReceiver.sol";

/*───────────────────────────────────────────────────────────────────────────
  The Solidity-side suite.

  tools/verify.mjs is the one that takes a whole tokenURI apart on a live
  EVM and compares the recovered document to the source byte for byte; this
  is the unit and property layer underneath it, and it is where the fuzzer
  lives.
───────────────────────────────────────────────────────────────────────────*/
contract IpseityTest is Test {
    Engine   engine;
    Sigil    sigil;
    Renderer renderer;
    Ipseity  token;

    address curator = address(this);
    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);

    bytes constant HEAD = "<!DOCTYPE html><html><head><title>t</title></head>";
    bytes constant BODY = "<body><script>window.IPSE&&0</script></body></html>";

    function setUp() public {
        // the canonical registry, so account() is checked against the real
        // derivation rather than a convenient stand-in
        vm.etch(
            0x000000006551c19487814612e58FE06813775758,
            address(new ERC6551Registry()).code
        );

        engine   = new Engine(false);
        sigil    = new Sigil();
        renderer = new Renderer(engine, sigil);
        token    = new Ipseity(IRenderer(address(renderer)),
            address(new IpseityAccount()), address(new GripVault()), 1, 4096);

        engine.loadHead(HEAD);
        engine.loadBody(BODY);
        engine.freeze();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _mint(address who) internal returns (uint256 id) {
        vm.prank(who);
        id = token.mint{value: 0.01 ether}();
    }

    /*═════════════════ SSTORE2 ═════════════════*/

    /// @dev The regression that matters most. The CODECOPY source offset in
    ///      the init code has to be the exact length of the prologue above
    ///      it. Off by two and every shard comes back with the tail of the
    ///      init code glued to its front and two bytes missing from its end
    ///      — which still deploys, still reads, and silently corrupts the
    ///      document.
    function test_sstore2_roundTripsExactly() public {
        bytes memory data = hex"1f8b0800000000000003ed5ddb72db38";
        address ptr = SSTORE2.write(data);
        assertEq(SSTORE2.read(ptr), data, "shard did not come back as written");
        assertEq(SSTORE2.size(ptr), data.length);
        assertTrue(ptr.code[0] == bytes1(0x00), "runtime must begin with STOP");
    }

    function testFuzz_sstore2_roundTrips(bytes memory data) public {
        vm.assume(data.length > 0 && data.length <= 8_000);
        assertEq(SSTORE2.read(SSTORE2.write(data)), data);
    }

    function test_engine_documentMatchesWhatWasLoaded() public view {
        assertEq(engine.headBytes(), HEAD);
        assertEq(engine.bodyBytes(), BODY);
    }

    function test_engine_frozenIsForever() public {
        vm.expectRevert(Engine.IsFrozen.selector);
        engine.loadBody("more");
    }

    /*═════════════════ ERC-165 ═════════════════*/

    function test_supportsInterface() public view {
        bytes4[13] memory ids = [
            bytes4(0x01ffc9a7), // ERC-165
            bytes4(0x80ac58cd), // ERC-721
            bytes4(0x5b5e139f), // ERC-721Metadata
            bytes4(0x780e9d63), // ERC-721Enumerable
            bytes4(0x2a55205a), // ERC-2981
            bytes4(0x49064906), // ERC-4906 — fixed by the EIP, not derivable
            bytes4(0xad092b5c), // ERC-4907
            bytes4(0xb45a3c0e), // ERC-5192
            bytes4(0x91a6262f), // ERC-6454
            bytes4(0xe8a3d485), // ERC-7572
            bytes4(0x06e1bc5b), // ERC-7160
            bytes4(0xaf332f3e), // ERC-7496
            bytes4(0x7f5828d0)  // ERC-173
        ];
        for (uint256 i; i < ids.length; ++i) {
            assertTrue(token.supportsInterface(ids[i]), "missing interface");
        }
        assertFalse(token.supportsInterface(0xffffffff), "ERC-165 forbids 0xffffffff");
    }

    /*═════════════════ issuance ═════════════════*/

    function test_mint() public {
        uint256 id = _mint(alice);
        assertEq(id, 1);
        assertEq(token.ownerOf(id), alice);
        assertEq(token.totalSupply(), 1);
        assertEq(token.balanceOf(alice), 1);
        assertTrue(Section.valid(token.sectionOf(id)), "born with an unrenderable section");
    }

    function test_mint_refusesUnderpayment() public {
        vm.prank(alice);
        vm.expectRevert(Ipseity.Underpaid.selector);
        token.mint{value: 0.001 ether}();
    }

    function testFuzz_mint_alwaysBornRenderable(uint256 salt) public {
        vm.prevrandao(bytes32(salt));
        vm.warp(block.timestamp + (salt % 10_000));
        uint256 id = _mint(alice);
        uint256 word = token.sectionOf(id);
        assertTrue(Section.form(word) < 8, "solid outside the eight");
        assertTrue(Section.valid(word));
        assertEq(word >> 128, 0, "nothing above the section word");
    }

    /*═════════════════ the causal loop ═════════════════*/

    function test_commit_rewritesWhatRenders() public {
        uint256 id = _mint(alice);
        uint256 word = Section.pack([uint16(1), 2, 3, 4, 5, 6], 40000, 5, 199);

        vm.prank(alice);
        token.commit(id, word);

        assertEq(token.sectionOf(id), word);
        (uint256 ops,, uint256 strata,) = token.statsOf(id);
        assertEq(ops, 1);
        assertEq(strata, 1);
        assertEq(uint256(token.getTraitValue(id, bytes32("solid"))), 5);
        assertEq(uint256(token.getTraitValue(id, bytes32("hue"))), 199);
    }

    function test_commit_refusesASolidThatDoesNotExist() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(Ipseity.BadSection.selector);
        token.commit(id, uint256(8) << 112);
    }

    function test_commit_refusesBitsAboveTheWord() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(Ipseity.BadSection.selector);
        token.commit(id, uint256(1) << 200);
    }

    function test_commit_isForHoldersOnly() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(Ipseity.NotOperator.selector);
        token.commit(id, 0);
    }

    function testFuzz_sectionWord_roundTrips(
        uint16 a0, uint16 a1, uint16 a2, uint16 a3, uint16 a4, uint16 a5,
        uint16 w, uint8 f, uint8 h
    ) public pure {
        f = uint8(bound(f, 0, 7));
        uint256 word = Section.pack([a0, a1, a2, a3, a4, a5], w, f, h);
        assertEq(uint256(Section.angle(word, 0)), uint256(a0));
        assertEq(uint256(Section.angle(word, 3)), uint256(a3));
        assertEq(uint256(Section.angle(word, 5)), uint256(a5));
        assertEq(uint256(Section.offsetW(word)), uint256(w));
        assertEq(uint256(Section.form(word)), uint256(f));
        assertEq(uint256(Section.hue(word)), uint256(h));
        assertTrue(Section.valid(word));
    }

    /*═════════════════ ERC-7496 ═════════════════*/

    function test_traits_onlyHueIsSettable() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        token.setTrait(id, bytes32("hue"), bytes32(uint256(42)));
        assertEq(uint256(token.getTraitValue(id, bytes32("hue"))), 42);

        vm.prank(alice);
        vm.expectRevert(Ipseity.TraitNotSettable.selector);
        token.setTrait(id, bytes32("strata"), bytes32(uint256(9)));
    }

    /*═════════════════ ERC-5192 / ERC-6454 ═════════════════*/

    /// @dev One flag, two standards. If these ever disagree the collection
    ///      is telling two different stories about whether it can be sold.
    function testFuzz_lockAndTransferableNeverDisagree(bool bind) public {
        uint256 id = _mint(alice);
        if (bind) {
            vm.prank(alice);
            token.lock(id);
        }
        assertEq(token.locked(id), bind);
        assertEq(token.isTransferable(id, alice, bob), !bind);
    }

    function test_boundTokenWillNotMove() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        token.lock(id);
        vm.prank(alice);
        vm.expectRevert(Ipseity.NotTransferable.selector);
        token.transferFrom(alice, bob, id);
    }

    function test_isTransferable_mintingAndBurning() public {
        uint256 id = _mint(alice);
        assertTrue(token.isTransferable(id, address(0), alice), "minting is allowed");
        assertFalse(token.isTransferable(id, alice, address(0)), "nothing is burned here");
    }

    /*═════════════════ ERC-4907 ═════════════════*/

    function test_borrowerMayOperateButNotSell() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        token.setUser(id, bob, uint64(block.timestamp + 7 days));
        assertEq(token.userOf(id), bob);

        vm.prank(bob);
        token.commit(id, Section.pack([uint16(0), 0, 0, 0, 0, 0], 0, 1, 0));
        assertEq(uint256(Section.form(token.sectionOf(id))), 1);

        vm.prank(bob);
        vm.expectRevert(Ipseity.NotHolder.selector);
        token.transferFrom(alice, bob, id);
    }

    function test_leaseExpires() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        token.setUser(id, bob, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        assertEq(token.userOf(id), address(0), "an expired lease is not a lease");
    }

    function test_leaseDoesNotSurviveTheSale() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        token.setUser(id, bob, uint64(block.timestamp + 30 days));
        vm.prank(alice);
        token.transferFrom(alice, bob, id);
        assertEq(token.userOf(id), address(0));
    }

    /*═════════════════ ERC-7160 ═════════════════*/

    function test_faces() public {
        uint256 id = _mint(alice);
        (uint256 index, string[] memory uris, bool pinned) = token.tokenURIs(id);
        assertEq(uris.length, 3);
        assertEq(index, 0);
        assertFalse(pinned);

        vm.prank(alice);
        token.pinTokenURI(id, 2);
        assertTrue(token.hasPinnedTokenURI(id));
        assertEq(token.tokenURI(id), token.tokenURIAt(id, 2));

        vm.prank(alice);
        token.unpinTokenURI(id);
        assertEq(token.tokenURI(id), token.tokenURIAt(id, 0));
    }

    function test_pinRefusesAFaceThatDoesNotExist() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(Ipseity.BadIndex.selector);
        token.pinTokenURI(id, 3);
    }

    /*═════════════════ ERC-721 ═════════════════*/

    function test_enumerationSurvivesChurn() public {
        for (uint256 i; i < 5; ++i) _mint(alice);
        assertEq(token.balanceOf(alice), 5);

        // take one out of the middle: the last token is swapped into the hole
        vm.prank(alice);
        token.transferFrom(alice, bob, 3);

        uint256 seen;
        for (uint256 i; i < 4; ++i) seen |= 1 << token.tokenOfOwnerByIndex(alice, i);
        assertEq(seen, (1 << 1) | (1 << 2) | (1 << 4) | (1 << 5), "index lost a token");
        assertEq(token.tokenOfOwnerByIndex(bob, 0), 3);
        assertEq(token.tokenByIndex(0), 1);
    }

    function test_safeTransferChecksTheReceiver() public {
        uint256 id = _mint(alice);
        MockReceiver good = new MockReceiver();
        vm.prank(alice);
        token.safeTransferFrom(alice, address(good), id);
        assertEq(token.ownerOf(id), address(good));

        uint256 id2 = _mint(alice);
        vm.prank(alice);
        vm.expectRevert();
        token.safeTransferFrom(alice, address(engine), id2);
    }

    function test_royalty() public {
        _mint(alice);
        (address to, uint256 amount) = token.royaltyInfo(1, 1 ether);
        assertEq(to, curator);
        assertEq(amount, 0.05 ether);
    }

    /*═════════════════ ERC-173 ═════════════════*/

    /// @dev One-step handover is how collections lose their admin forever:
    ///      a mistyped address is accepted, emitted and irreversible.
    function test_ownershipTakesTwoSteps() public {
        assertEq(token.owner(), curator);

        token.transferOwnership(alice);
        assertEq(token.owner(), curator, "the handover took effect on one call");

        vm.prank(bob);
        vm.expectRevert(Ipseity.NotCurator.selector);
        token.acceptOwnership();

        vm.prank(alice);
        token.acceptOwnership();
        assertEq(token.owner(), alice);
        assertEq(token.curator(), alice);
    }

    function test_ownershipCanBeAbandonedDeliberately() public {
        token.renounceOwnership();
        assertEq(token.owner(), address(0));
        vm.expectRevert(Ipseity.NotCurator.selector);
        token.setPricing(0, 0);
    }

    /*═════════════════ ERC-6551 ═════════════════*/

    function test_boundAccountIsDerivedNotAsked() public {
        uint256 id = _mint(alice);
        address predicted = token.account(id);
        assertEq(predicted.code.length, 0, "nothing deployed yet");
        address made = token.embody(id);
        assertEq(made, predicted, "the derivation and the registry disagree");
        assertTrue(made.code.length > 0);
    }

    /*═════════════════ the sealed kernel ═════════════════*/

    function test_kernelTransferNeedsAProofAboutThisPayload() public {
        uint256 id = _mint(alice);
        token.setVerifier(new MockVerifier());

        bytes32 h1 = keccak256("one");
        bytes32 h2 = keccak256("two");
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = h1;

        vm.prank(alice);
        token.sealKernel(id, hashes, bytes32(uint256(1)));

        // a proof about some other payload must not move this token
        vm.prank(alice);
        vm.expectRevert(Ipseity.ProofRejected.selector);
        token.transferWithKernel(bob, id, abi.encodePacked(h2, h2, bytes32(uint256(2))));

        vm.prank(alice);
        token.transferWithKernel(bob, id, abi.encodePacked(h1, h2, bytes32(uint256(2))));
        assertEq(token.ownerOf(id), bob);
        assertEq(token.sealedTo(id), bytes32(uint256(2)));
        assertEq(token.dataHashesOf(id)[0], h2);
    }

    function test_cloneRecordsItsParent() public {
        uint256 id = _mint(alice);
        token.setVerifier(new MockVerifier());
        bytes32 h1 = keccak256("one");
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = h1;

        vm.prank(alice);
        token.sealKernel(id, hashes, bytes32(uint256(1)));
        // cloning is minting, and it is priced like minting. It was free
        // once, which made the supply cap decorative: a holder could clone
        // their own token without limit and pay nothing for any of them.
        vm.prank(alice);
        vm.expectRevert(Ipseity.Underpaid.selector);
        token.cloneWithKernel(bob, id, abi.encodePacked(h1, h1, bytes32(uint256(3))));

        vm.prank(alice);
        uint256 child = token.cloneWithKernel{value: 0.01 ether}(
            bob, id, abi.encodePacked(h1, h1, bytes32(uint256(3))));

        assertEq(token.ownerOf(child), bob);
        assertEq(token.parentOf(child), id);
        assertEq(token.parentOf(id), 0, "a minted token has no parent");
    }

    /*═════════════════ curation ═════════════════*/

    function test_strangersCannotCurate() public {
        vm.prank(bob);
        vm.expectRevert(Ipseity.NotCurator.selector);
        token.setPricing(0, 0);
    }

    function test_sealedRendererIsForever() public {
        token.sealRenderer();
        vm.expectRevert(Ipseity.AlreadySealed.selector);
        token.setRenderer(IRenderer(address(renderer)));
    }

    function test_royaltyHasACeiling() public {
        vm.expectRevert(Ipseity.BadIndex.selector);
        token.setRoyalty(curator, 1001);
    }
}

/*───────────────────────────────────────────────────────────────────────────
  The projector
───────────────────────────────────────────────────────────────────────────*/
contract SigilTest is Test {
    Sigil sigil;

    function setUp() public {
        sigil = new Sigil();
    }

    function test_everySolidProjects() public view {
        for (uint8 f; f < 8; ++f) {
            uint256 word = Section.pack([uint16(4000), 9000, 1200, 30000, 800, 40000], 32768, f, 33);
            bytes memory d = sigil.path(word, keccak256(abi.encodePacked(f)));
            assertTrue(d.length > 20, "a solid produced no geometry");
        }
    }

    /// @dev Four elevations, not three. Dropping x, y or z gives a drawing
    ///      that nothing three-dimensional could cast.
    function test_fourElevationsAllDiffer() public view {
        uint256 word = Section.pack([uint16(4000), 9000, 1200, 30000, 800, 40000], 32768, 0, 33);
        bytes32 seen;
        for (uint8 a; a < 4; ++a) {
            bytes32 h = keccak256(sigil.pathAlong(word, bytes32(0), a));
            assertTrue(h != seen, "two elevations came out identical");
            seen = h;
        }
    }

    function testFuzz_svgIsWellFormed(uint256 word, bytes32 seed) public view {
        word = word & ((uint256(1) << 112) - 1) | (uint256(bound(uint256(uint8(word >> 112)), 0, 7)) << 112);
        bytes memory s = sigil.svg(1, word, seed, 3);
        assertTrue(s.length > 400);
        // a truncated or mistyped root element is a blank thumbnail everywhere
        assertTrue(bytes6(s) == bytes6("<svg x"), "not an svg root");
    }

    /*── the trigonometry the projection stands on ──*/

    /// @dev Tolerances are 10 parts in 1e9, not the 200-2000 they were. The
    ///      loose ones were never satisfied: at four Taylor terms sin(pi/2)
    ///      read 1.000003543, and because this file had never been executed
    ///      nothing said so. Six terms hold every point on the circle to
    ///      within 3, so 10 is a real ceiling with margin rather than a
    ///      number chosen to accommodate an error nobody had measured.
    function test_trig() public pure {
        assertApproxEqAbs(Trig.sin(0), 0, 10, "sin0");
        assertApproxEqAbs(Trig.sin(Trig.HALF_PI), 1e9, 10, "sinHalfPi");
        assertApproxEqAbs(Trig.sin(Trig.PI), 0, 10, "sinPi");
        assertApproxEqAbs(Trig.sin(-Trig.HALF_PI), -1e9, 10, "sinNegHalfPi");
        assertApproxEqAbs(Trig.cos(0), 1e9, 10, "cos0");
        assertApproxEqAbs(Trig.cos(Trig.PI), -1e9, 10, "cosPi");
        // 30 degrees
        assertApproxEqAbs(Trig.sin(523598776), 5e8, 10, "sin30");
    }

    /// @dev The identity the whole projection depends on. If sin²+cos² drifts
    ///      from one, the rotation is no longer a rotation and the solid
    ///      quietly changes size as it turns.
    function testFuzz_pythagorean(int256 x) public pure {
        x = bound(x, -100 * Trig.TWO_PI, 100 * Trig.TWO_PI);
        int256 s = Trig.sin(x);
        int256 c = Trig.cos(x);
        int256 sum = (s * s + c * c) / 1e9;
        assertApproxEqAbs(sum, 1e9, 100, "the rotation is not orthonormal");
    }
}
