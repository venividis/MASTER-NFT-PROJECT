// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Chrome} from "../src/Chrome.sol";
import {Desk} from "../src/Desk.sol";
import {DeskTalk} from "../src/DeskTalk.sol";
import {Parley, ISpeaker} from "../src/Parley.sol";
import {PageDoor} from "../src/PageDoor.sol";
import {PageToken} from "../src/PageToken.sol";
import {PageMarket} from "../src/PageMarket.sol";
import {PagePool} from "../src/PagePool.sol";
import {PageServices} from "../src/PageServices.sol";
import {PageManifest} from "../src/PageManifest.sol";
import {PageTalk} from "../src/PageTalk.sol";
import {PageRooms} from "../src/PageRooms.sol";
import {
    Premises, IPageDoor, IPageToken, IPageMarket, IPagePool,
    IPageServices, IPageManifest, IPageTalk, IPageRooms
} from "../src/Premises.sol";
import {
    IHub, IPoolRead, ILeaseRead, IChrome, IDesk, IParley, ITalkDesk
} from "../src/interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  Deploying the site

    IPSEITY=0x… POOL=0x… LEASE=0x… \
      forge script script/Site.s.sol --rpc-url <chain> --broadcast

  Two contracts here are not pages and outlive any of them:

    Parley    the protocol the tokens talk over. Deploy it once. Every
              message ever sent is a log emitted by this address, so
              replacing it does not migrate a conversation, it ends one.

    Premises  the router. Every page address is one of its immutable
              constructor arguments, so replacing a page means deploying a
              new router and pointing the name at it — which is exactly the
              property that keeps the two routes serving the artwork off the
              mutable path.

  Set the ENS `contentcontract` TEXT record to the Premises address — the
  ERC-6821 record, not `contenthash` — and the whole thing resolves natively
  in any web3://-aware client, with no DNS and no server.
───────────────────────────────────────────────────────────────────────────*/
contract DeploySite is Script {
    function run() external {
        address hub = vm.envAddress("IPSEITY");
        address pool = vm.envAddress("POOL");
        address lease = vm.envAddress("LEASE");

        vm.startBroadcast();

        Parley parley = new Parley(ISpeaker(hub));
        Chrome chrome = new Chrome();
        Desk desk = new Desk(IHub(hub), IPoolRead(pool), ILeaseRead(lease));
        DeskTalk talk = new DeskTalk(IParley(address(parley)), hub);

        PageToken pToken = new PageToken(
            IHub(hub), IChrome(address(chrome)), IPoolRead(pool), ILeaseRead(lease));
        PageMarket pMarket = new PageMarket(
            IHub(hub), IChrome(address(chrome)), IPoolRead(pool), IDesk(address(desk)));
        PagePool pPool = new PagePool(
            IHub(hub), IChrome(address(chrome)), IPoolRead(pool), IDesk(address(desk)));
        PageServices pServices = new PageServices(
            IHub(hub), IChrome(address(chrome)), ILeaseRead(lease), IDesk(address(desk)));
        PageManifest pManifest = new PageManifest(
            IHub(hub), IPoolRead(pool), ILeaseRead(lease), IParley(address(parley)));

        PageDoor pDoor = new PageDoor(
            IHub(hub), IChrome(address(chrome)), IDesk(address(desk)),
            ITalkDesk(address(talk)), IParley(address(parley)));
        PageTalk pTalk = new PageTalk(
            IHub(hub), IChrome(address(chrome)), IDesk(address(desk)),
            ITalkDesk(address(talk)), IParley(address(parley)));
        PageRooms pRooms = new PageRooms(
            IChrome(address(chrome)), IDesk(address(desk)),
            ITalkDesk(address(talk)), IParley(address(parley)));

        Premises premises = new Premises(
            IHub(hub), IChrome(address(chrome)),
            IPageDoor(address(pDoor)), IPageToken(address(pToken)),
            IPageMarket(address(pMarket)), IPagePool(address(pPool)),
            IPageServices(address(pServices)), IPageManifest(address(pManifest)),
            IPageTalk(address(pTalk)), IPageRooms(address(pRooms)));

        vm.stopBroadcast();

        console.log("Parley        ", address(parley));
        console.log("Chrome        ", address(chrome));
        console.log("Desk          ", address(desk));
        console.log("DeskTalk      ", address(talk));
        console.log("PageDoor      ", address(pDoor));
        console.log("PageToken     ", address(pToken));
        console.log("PageMarket    ", address(pMarket));
        console.log("PagePool      ", address(pPool));
        console.log("PageServices  ", address(pServices));
        console.log("PageManifest  ", address(pManifest));
        console.log("PageTalk      ", address(pTalk));
        console.log("PageRooms     ", address(pRooms));
        console.log("");
        console.log("Premises      ", address(premises));
        console.log("");
        console.log("Set the ENS contentcontract TEXT record to the Premises");
        console.log("address (ERC-6821). Then web3://<name>/ reaches it.");
    }
}
