// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Timelock} from "../src/lib/Timelock.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {ConvictionPool} from "../src/ConvictionPool.sol";
import {Patronage} from "../src/Patronage.sol";
import {Bourse} from "../src/Bourse.sol";
import {Charter} from "../src/Charter.sol";
import {Wake} from "../src/Wake.sol";
import {House} from "../src/House.sol";
import {Registry} from "../src/Registry.sol";
import {Chambers} from "../src/Chambers.sol";
import {Codex} from "../src/Codex.sol";
import {Wager} from "../src/Wager.sol";
import {Counter} from "../src/Counter.sol";
import {Granary} from "../src/Granary.sol";
import {Scrivener} from "../src/Scrivener.sol";
import {Indenture} from "../src/Indenture.sol";
import {Strips} from "../src/Strips.sol";
import {Surety} from "../src/Surety.sol";
import {Issue} from "../src/Issue.sol";
import {IconRegistry} from "../src/IconRegistry.sol";
import {SiteKernel} from "../src/SiteKernel.sol";
import {BagRenderer} from "../src/BagRenderer.sol";
import {ERC6551Registry} from "../src/vendor/ERC6551Registry.sol";

/// Robinhood Chain (4663) constants.
library Addresses {
    address constant CANONICAL_6551 = 0x000000006551c19487814612e58FE06813775758;
    uint256 constant CHAIN_ID = 4663;
}

/// env: PK, TREASURY, MULTISIG
/// forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PK");
        address treasury = vm.envAddress("TREASURY");
        address multisig = vm.envAddress("MULTISIG");
        vm.startBroadcast(pk);

        address registry = block.chainid == Addresses.CHAIN_ID
            ? Addresses.CANONICAL_6551
            : address(new ERC6551Registry());          // testnets w/o canonical

        Timelock tl      = new Timelock(multisig);
        DaveVault impl   = new DaveVault();
        DaveHeld hub     = new DaveHeld(registry, address(impl), address(tl), treasury);
        ConvictionPool p = new ConvictionPool(address(hub), address(tl));
        IconRegistry ic  = new IconRegistry(address(tl), treasury);
        SiteKernel k     = new SiteKernel(address(tl));
        BagRenderer r    = new BagRenderer(address(hub), address(ic), address(k));
        Patronage pat    = new Patronage(address(hub));
        Bourse bourse    = new Bourse(address(hub));
        Charter charter  = new Charter(address(hub));
        Wake wake        = new Wake(address(hub), address(bourse));
        House house      = new House(address(hub), address(charter));
        Registry rgy     = new Registry(address(hub));

        hub.wire(address(p), address(r));              // deployer one-shot
        Chambers chm     = new Chambers(address(hub));
        hub.dockChambers(address(chm));                // deployer one-shot, ever
        Codex codex      = new Codex(address(hub), address(chm), address(charter));
        hub.dockCodex(address(codex));                 // deployer one-shot, ever
        Wager wager      = new Wager(address(hub));
        Counter counter  = new Counter(address(hub));
        Granary granary  = new Granary(address(hub));
        Scrivener scriv  = new Scrivener(address(hub));
        Indenture ind    = new Indenture(address(hub));
        Strips strips    = new Strips(address(hub), address(granary));
        Surety surety    = new Surety(address(hub));
        Issue issue      = new Issue(address(hub));

        vm.stopBroadcast();

        console2.log("timelock  ", address(tl));
        console2.log("hub       ", address(hub));
        console2.log("vault impl", address(impl));
        console2.log("pool      ", address(p));
        console2.log("patronage ", address(pat));
        console2.log("bourse    ", address(bourse));
        console2.log("charter   ", address(charter));
        console2.log("wake      ", address(wake));
        console2.log("house     ", address(house));
        console2.log("registry  ", address(rgy));
        console2.log("chambers  ", address(chm));
        console2.log("codex     ", address(codex));
        console2.log("wager     ", address(wager));
        console2.log("counter   ", address(counter));
        console2.log("granary   ", address(granary));
        console2.log("scrivener ", address(scriv));
        console2.log("indenture ", address(ind));
        console2.log("strips    ", address(strips));
        console2.log("surety    ", address(surety));
        console2.log("issue     ", address(issue));
        console2.log("renderer  ", address(r));
        console2.log("icons     ", address(ic));
        console2.log("kernel    ", address(k));
        console2.log("NEXT (via timelock queue -> 7d -> execute):");
        console2.log(" 1. hub.addHook(patronage)");
        console2.log(" 1b. hub.addHook(bourse)");
        console2.log(" 1c. hub.addHook(charter) / addHook(house) / addHook(registry)");
        console2.log(" 1d. bourse.dock(wake)");
        console2.log(" 1e. hub.setTarget(charter/bourse/house/registry/patronage, true)  // sealed-chamber venues");
        console2.log(" 1f. hub.addHook(wager) / addHook(counter) / addHook(scrivener) / addHook(indenture)");
        console2.log(" 1g. hub.setTarget(wager/counter/granary/scrivener/indenture/strips/surety/issue, true)  // sealed capital reaches all desks");
        console2.log(" 1h. granary.bless(vetted 4626 silos)  // via timelock");
        console2.log(" 2. kernel.ship(premises runtime chunks — site/floor.html is the floor)");
        console2.log(" 3. icons.seed(launch set)");
        console2.log(" 4. hub.openWindow(start, end, gregRoot, nativeRoot, partnerRoot)");
        console2.log(" 5. after close: hub.postRankRoot(root)");
    }
}
