import ganache from 'ganache';
import {BrowserProvider,Contract,parseEther,keccak256,toUtf8Bytes} from 'ethers';
import {deployStack,deployContract,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {ConfluenceWallet} from '../../web/confluence/wallet.mjs';
import {LiveProtocol} from '../../web/genesis/live-protocol.mjs';
export async function mintedFixture(t){
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:50000000},logging:{quiet:true},wallet:{totalAccounts:5,defaultBalance:1000}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  const ownerSigner=await provider.getSigner(0),worker=await provider.getSigner(1),next=await provider.getSigner(2),owner=await ownerSigner.getAddress();
  const stack=await deployStack({signer:ownerSigner,attesterAddress:owner,royaltyBps:0});
  for(let id=1;id<=3;id++){
    const secret=keccak256(toUtf8Bytes('ANIMA-NFT milestone '+id));
    await(await stack.collection.commitAwakening(await stack.collection.commitmentFor(owner,secret,owner),{value:parseEther('20')})).wait();
    await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});await(await stack.collection.revealAwakening(secret,owner)).wait();
  }
  const d=(name,args=[])=>deployContract(name,ownerSigner,args),account=await stack.collection.accountOf(1);
  const ledger=await d('WorldLedger',[stack.collection.target]),market=await d('NativeMarket',[ledger.target]),vault=await d('TimeVault',[ledger.target]),launch=await d('GenesisLaunchpad',[ledger.target]);
  await(await ledger.sealModules(market.target,vault.target,launch.target)).wait();
  const now=(await provider.getBlock('latest')).timestamp;
  await(await launch.create('Milestone Light','LIGHT','Local fixture',parseEther('1000000'),0,now+3700,parseEther('1'),parseEther('10'),0,10000,2592000,0)).wait();
  await(await launch.contribute(1,0,{value:parseEther('10')})).wait();await rpc.request({method:'evm_increaseTime',params:[3800]});await rpc.request({method:'evm_mine',params:[]});await(await launch.settle(1)).wait();
  const token=new Contract((await launch.launchInfo(1))[0],loadArtifact('GenesisToken').abi,provider);
  const w=new ConfluenceWallet();Object.assign(w,{connected:true,revision:1,raw:rpc,provider,signer:ownerSigner,address:owner,chainId:31337n,core:stack.collection,collection:stack.collection.target,tokenId:1n,account,contract:new Contract(account,loadArtifact('SovereignAccount').abi,ownerSigner)});
  return {rpc,provider,ownerSigner,worker,next,owner,stack,d,ledger,market,vault,launch,token,w,api:new LiveProtocol(w)};
}
