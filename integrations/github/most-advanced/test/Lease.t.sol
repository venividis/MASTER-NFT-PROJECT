// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Engine} from "../src/Engine.sol";
import {Sigil} from "../src/Sigil.sol";
import {Renderer} from "../src/Renderer.sol";
import {Ipseity, IRenderer} from "../src/Ipseity.sol";
import {IpseityAccount} from "../src/IpseityAccount.sol";
import {GripVault} from "../src/GripVault.sol";
import {Lease, IIpseityLease} from "../src/Lease.sol";
import {ERC6551Registry} from "./mocks/ERC6551Registry.sol";

/*───────────────────────────────────────────────────────────────────────────
  A rental is only worth the sale that interrupts it.

  Renting was free before this, so nobody minded that a transfer clears the
  ERC-4907 user — which is correct, and has to stay correct, because a lease
  surviving a sale would mean buying a token meant buying a stranger's
  standing right to operate it.

  With money on the table that same rule is a way to take some. So the tests
  that matter here are not "a lease works"; they are the ones about the
  lease that does not finish.
───────────────────────────────────────────────────────────────────────────*/
contract LeaseTest is Test {
    Ipseity token;
    Lease   lease;

    address holder = address(this);
    address renter = address(0x8E17);
    address buyer  = address(0xB0FF);

    uint128 constant PER_DAY = 0.01 ether;

    function setUp() public {
        vm.etch(
            0x000000006551c19487814612e58FE06813775758,
            address(new ERC6551Registry()).code
        );
        Engine engine = new Engine(false);
        Renderer renderer = new Renderer(engine, new Sigil());
        engine.loadHead("<html><head></head>");
        engine.loadBody("<body></body></html>");
        engine.freeze();

        token = new Ipseity(IRenderer(address(renderer)),
            address(new IpseityAccount()), address(new GripVault()), 1, 4096);
        lease = new Lease(IIpseityLease(address(token)));

        vm.deal(holder, 100 ether);
        vm.deal(renter, 100 ether);
        vm.deal(buyer, 100 ether);
        vm.warp(1_000_000);

        token.mint{value: 0.01 ether}();                 // id 1, held by this
    }

    function _offer() internal {
        token.setLeaseAgent(1, address(lease));
        lease.list(1, PER_DAY, 1, 30);
    }

    /*═══════════════ the narrow capability ═══════════════*/

    /// @dev The reason `setUserVia` exists rather than an ERC-721 approval:
    ///      an approval would have carried `transferFrom` with it.
    function test_theAgentMaySetTheUserAndNothingElse() public {
        token.setLeaseAgent(1, address(this));

        token.setUserVia(1, renter, uint64(block.timestamp + 1 days));
        assertEq(token.userOf(1), renter, "the agent could not do its one job");

        // and the same address, still the agent, cannot do the rest
        vm.prank(address(0xDEAD));
        vm.expectRevert(Ipseity.NotLeaseAgent.selector);
        token.setUserVia(1, address(0xDEAD), uint64(block.timestamp + 1 days));
    }

    function test_namingAnAgentIsForTheHolder() public {
        vm.prank(renter);
        vm.expectRevert(Ipseity.NotHolder.selector);
        token.setLeaseAgent(1, address(lease));
    }

    function test_theAgentDoesNotSurviveTheSale() public {
        _offer();
        assertEq(token.leaseAgentOf(1), address(lease));
        token.transferFrom(holder, buyer, 1);
        assertEq(token.leaseAgentOf(1), address(0), "a buyer inherited the seller's arrangement");
    }

    function test_listingWithoutNamingTheAgentIsRefused() public {
        vm.expectRevert(Lease.NotAuthorised.selector);
        lease.list(1, PER_DAY, 1, 30);
    }

    /*═══════════════ the counter ═══════════════*/

    function test_rentAndDrive() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 7}(1, 7, PER_DAY);

        assertEq(token.userOf(1), renter);
        assertEq(address(lease).balance, PER_DAY * 7, "the rent is held, not paid");
        assertEq(lease.earned(1), 0, "nothing has vested yet");

        // a renter is an operator: they may turn the solid
        uint256 before = token.sectionOf(1);
        vm.prank(renter);
        token.commit(1, (before + 1) & ((uint256(1) << 128) - 1));
        assertTrue(token.sectionOf(1) != before, "the renter could not drive it");

        // and never a holder
        vm.prank(renter);
        vm.expectRevert(Ipseity.NotHolder.selector);
        token.transferFrom(holder, renter, 1);
    }

    function test_paymentMustBeExact() public {
        _offer();
        vm.prank(renter);
        vm.expectRevert(Lease.WrongPayment.selector);
        lease.rent{value: PER_DAY * 7 + 1}(1, 7, PER_DAY);
    }

    /// @dev The same guard `swap` takes with `minOut`: a holder can raise the
    ///      price while the transaction is in the mempool.
    function test_aRaisedPriceMakesTheRentFailRatherThanCostMore() public {
        _offer();
        lease.list(1, PER_DAY * 2, 1, 30);
        vm.prank(renter);
        vm.expectRevert(Lease.PriceMoved.selector);
        lease.rent{value: PER_DAY * 2 * 7}(1, 7, PER_DAY);
    }

    function test_oneRenterAtATime() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY}(1, 1, PER_DAY);

        vm.prank(buyer);
        vm.expectRevert(Lease.AlreadyRented.selector);
        lease.rent{value: PER_DAY}(1, 1, PER_DAY);
    }

    function test_termsAreEnforced() public {
        _offer();
        vm.prank(renter);
        vm.expectRevert(Lease.BadTerm.selector);
        lease.rent{value: PER_DAY * 31}(1, 31, PER_DAY);
    }

    /*═══════════════ the books ═══════════════*/

    function test_aTermThatRunsOutVestsWhole() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 7}(1, 7, PER_DAY);

        vm.warp(block.timestamp + 8 days);
        lease.settle(1);
        assertEq(lease.earned(1), PER_DAY * 7);

        uint256 before = holder.balance;
        lease.collect(1, holder);
        assertEq(holder.balance - before, PER_DAY * 7);
        assertEq(address(lease).balance, 0, "something was stranded");
    }

    /// @dev The one that matters. Nobody declares the lease broken; it is
    ///      read off the token — the user is no longer the renter and the
    ///      term is not up.
    function test_aSaleMidTermSplitsTheRentByElapsedTime() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);

        vm.warp(block.timestamp + 2 days);
        lease.settle(1);                            // the lease is seen running
        token.transferFrom(holder, buyer, 1);
        assertEq(token.userOf(1), address(0), "the sale did not clear the user");

        lease.settle(1);
        uint256 vested = lease.earned(1);
        uint256 back = lease.owed(renter);

        assertEq(vested, PER_DAY * 2, "two days of ten did not vest");
        assertEq(vested + back, PER_DAY * 10, "the split lost or created ether");
        assertEq(address(lease).balance, vested + back, "the balance does not cover the books");
    }

    /// @dev Rent accrues to the token, not to the address holding it — the
    ///      same rule the market runs on, where fees land in the reserves.
    function test_theBuyerCollectsTheRentNotTheSeller() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);
        vm.warp(block.timestamp + 2 days);
        lease.settle(1);
        token.transferFrom(holder, buyer, 1);
        lease.settle(1);

        vm.expectRevert(Lease.NotHolder.selector);
        lease.collect(1, holder);

        uint256 before = buyer.balance;
        vm.prank(buyer);
        lease.collect(1, buyer);
        assertEq(buyer.balance - before, PER_DAY * 2);
    }

    function test_theRenterReclaimsTimeTheyDidNotGet() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);
        vm.warp(block.timestamp + 2 days);
        lease.settle(1);
        token.transferFrom(holder, buyer, 1);
        lease.settle(1);

        uint256 before = renter.balance;
        vm.prank(renter);
        lease.claim();
        assertEq(renter.balance - before, PER_DAY * 8);
        assertEq(lease.owed(renter), 0);
    }

    /// @dev Ending a lease costs the holder exactly what it was earning
    ///      them. That is the most a contract can do about it without
    ///      taking the token hostage on the renter's behalf.
    function test_theHolderMayEndALeaseAndPaysForIt() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);

        vm.warp(block.timestamp + 5 days);
        lease.settle(1);                            // seen running, five days in
        token.setUser(1, address(0), 0);            // the holder's last word
        lease.settle(1);

        assertEq(lease.earned(1), PER_DAY * 5, "the holder kept time they did not deliver");
        assertEq(lease.owed(renter), PER_DAY * 5);
    }

    function test_delistingDoesNotEndALeaseAlreadyPaidFor() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 7}(1, 7, PER_DAY);
        lease.delist(1);

        assertEq(token.userOf(1), renter, "a paid term was cancelled");
        (bool ok, uint8 why) = lease.status(1);
        assertFalse(ok);
        assertEq(uint256(why), 1);
    }

    function test_nothingToCollectIsAnError() public {
        vm.expectRevert(Lease.NothingOwed.selector);
        lease.collect(1, holder);
    }

    /*═══════════════ the ones an adversary found ═══════════════*/

    /// @dev The order of the two checks in _settle. Written expiry-first, a
    ///      lease broken on day one vested in full to the holder as soon as
    ///      the term ran out — because after expiry `userOf` reads zero for
    ///      an intact lease and a broken one alike, so the renter's claim on
    ///      nine undelivered days expired quietly with the lease.
    function test_aLeaseBrokenOnDayOneStillRefundsAfterTheTermHasPassed() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);

        vm.warp(block.timestamp + 1 days);
        lease.settle(1);                            // the lease is seen running
        token.transferFrom(holder, buyer, 1);       // and broken on day one

        vm.warp(block.timestamp + 30 days);         // nobody settles until much later
        lease.settle(1);

        assertEq(lease.earned(1), PER_DAY, "the holder kept nine days it never delivered");
        assertEq(lease.owed(renter), PER_DAY * 9, "the renter's refund evaporated");
    }

    /// @dev The bias when nobody was watching. The contract cannot know when
    ///      a lease broke, only the last block in which it was seen running
    ///      — so a holder who breaks one and never says so is credited for
    ///      nothing after that point. The party who can end a lease is the
    ///      party who has to speak up to be paid for it.
    function test_aHolderWhoNeverSettlesIsCreditedOnlyToTheLastLook() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);

        vm.warp(block.timestamp + 4 days);
        token.transferFrom(holder, buyer, 1);       // broken, and never observed
        vm.warp(block.timestamp + 30 days);
        lease.settle(1);

        assertEq(lease.earned(1), 0, "credited for time nobody watched pass");
        assertEq(lease.owed(renter), PER_DAY * 10);
    }

    /// @dev And the way to do it properly, which costs the holder nothing.
    function test_endLeasePaysTheHolderForExactlyTheTimeDelivered() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);

        vm.warp(block.timestamp + 4 days);
        lease.endLease(1);

        assertEq(token.userOf(1), address(0), "the lease did not actually end");
        assertEq(lease.earned(1), PER_DAY * 4);
        assertEq(lease.owed(renter), PER_DAY * 6);
        assertEq(address(lease).balance, PER_DAY * 10);
    }

    /// @dev Settling late must not credit the holder for time after the term.
    function test_settlingLateCreditsNoTimeBeyondTheBreak() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 4}(1, 4, PER_DAY);
        vm.warp(block.timestamp + 1 days);
        lease.settle(1);
        token.setUser(1, address(0), 0);            // the holder's last word
        vm.warp(block.timestamp + 365 days);
        lease.settle(1);
        assertEq(lease.earned(1), PER_DAY, "elapsed time ran on past the break");
        assertEq(lease.earned(1) + lease.owed(renter), PER_DAY * 4);
    }

    /// @dev A transfer clears the lease agent, which stops anyone renting —
    ///      but the seller's terms sat in storage waiting, and went live
    ///      again at the seller's price the moment the buyer named an agent
    ///      for their own reasons.
    function test_theSellersTermsDoNotReArmForTheBuyer() public {
        _offer();
        token.transferFrom(holder, buyer, 1);

        vm.prank(buyer);
        token.setLeaseAgent(1, address(lease));     // for reasons of their own

        (bool ok, uint8 why) = lease.status(1);
        assertFalse(ok, "the previous owner's terms went live on someone else's token");
        assertEq(uint256(why), 1);

        vm.prank(renter);
        vm.expectRevert(Lease.NotOpen.selector);
        lease.rent{value: PER_DAY}(1, 1, PER_DAY);
    }

    /// @dev An ERC-721 approval is revocable in one transaction. A lease
    ///      agent named under one was not, so the permission outlived the
    ///      permission that granted it.
    function test_anApproveeCannotNameALeaseAgent() public {
        token.approve(buyer, 1);
        vm.prank(buyer);
        vm.expectRevert(Ipseity.NotHolder.selector);
        token.setLeaseAgent(1, address(lease));
    }

    /// @dev The contract's own solvency helper reported less than it owed.
    function test_obligationsCountsEveryLedger() public {
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);
        vm.warp(block.timestamp + 2 days);
        lease.settle(1);
        token.transferFrom(holder, buyer, 1);
        lease.settle(1);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        address[] memory who = new address[](1);
        who[0] = renter;
        assertEq(lease.obligations(ids, who), address(lease).balance,
            "the solvency helper does not see everything the contract owes");
    }

    /*═══════════════ properties ═══════════════*/

    /// @dev Whatever the term and whenever it is cut short, the two ledgers
    ///      always sum to exactly what was paid — never more, never less.
    function testFuzz_theSplitNeverLosesOrCreatesEther(uint32 dayCount, uint64 cutAfter) public {
        dayCount = uint32(bound(dayCount, 1, 30));
        cutAfter = uint64(bound(cutAfter, 1, uint256(dayCount) * 1 days - 1));

        _offer();
        uint256 paid = uint256(PER_DAY) * dayCount;
        vm.deal(renter, paid + 1 ether);
        vm.prank(renter);
        lease.rent{value: paid}(1, dayCount, PER_DAY);

        vm.warp(block.timestamp + cutAfter);
        lease.settle(1);                        // the lease is seen running
        token.transferFrom(holder, buyer, 1);
        // and settled long after the term, which is where the ordering bug hid
        vm.warp(block.timestamp + uint256(dayCount) * 1 days + 1);
        lease.settle(1);

        assertEq(lease.earned(1) + lease.owed(renter), paid, "the split moved ether");
        assertEq(address(lease).balance, paid, "the balance stopped matching the books");
        assertLe(lease.earned(1), paid);
    }

    /// @dev A cut-short lease vests no more than the elapsed fraction. Integer
    ///      division truncates toward zero, so the holder is the one rounded
    ///      against, which is the right direction: the party who ended it
    ///      early does not profit from the rounding.
    function testFuzz_theHolderNeverVestsMoreThanTheTimeDelivered(uint64 cutAfter) public {
        cutAfter = uint64(bound(cutAfter, 1, 10 days - 1));
        _offer();
        vm.prank(renter);
        lease.rent{value: PER_DAY * 10}(1, 10, PER_DAY);

        vm.warp(block.timestamp + cutAfter);
        lease.settle(1);
        token.setUser(1, address(0), 0);
        lease.settle(1);

        uint256 fair = (uint256(PER_DAY) * 10 * cutAfter) / (10 days);
        assertLe(lease.earned(1), fair, "vested more than the time delivered");
    }

    receive() external payable {}
}
