import {Contract, getAddress, keccak256, toUtf8Bytes} from 'ethers';

export const REGISTRATION_TYPES={Provider:[{name:'provider',type:'address'},{name:'metadataHash',type:'bytes32'},{name:'uriHash',type:'bytes32'},{name:'capabilities',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'validUntil',type:'uint48'},{name:'active',type:'bool'}]};
const DIRECTORY_ABI=['function list(uint256 start,uint256 limit) view returns(address[])','function provider(address who) view returns(tuple(bytes32 metadataHash,string uri,bytes32 capabilities,uint64 revision,uint48 validUntil,bool active))','function count() view returns(uint256)','function nonces(address) view returns(uint256)','function commerce() view returns(address)','event FeedbackGiven(uint256 indexed jobId,address indexed provider,address indexed reviewer,int8 score,bytes32 evidence)','event FeedbackRevoked(uint256 indexed jobId,address indexed reviewer)'];

/** Creates a chain-and-contract-specific update signature, also compatible with relaying. */
export async function signRegistration({signer,chainId,directory,metadata,uri,capabilities,nonce,validUntil,active=true}){
  const provider=getAddress(await signer.getAddress());const metadataHash=keccak256(toUtf8Bytes(metadata));
  const message={provider,metadataHash,uriHash:keccak256(toUtf8Bytes(uri)),capabilities,nonce,validUntil,active};
  const signature=await signer.signTypedData({name:'ANIMA Provider Directory',version:'1',chainId,verifyingContract:directory},REGISTRATION_TYPES,message);
  return {provider,metadataHash,uri,capabilities,nonce,validUntil,active,signature};
}

/** Reads a bounded page from the chosen registry. Metadata fetch is opt-in through a pinned transport. */
export async function discoverProviders({provider,directory,start=0,limit=25,capabilities,fetchMetadata}){
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid discovery page');
  const registry=new Contract(directory,DIRECTORY_ABI,provider);const block=await provider.getBlock('latest');
  const addresses=await registry.list(start,limit,{blockTag:block.number});const results=[];
  for(const address of addresses){
    const record=await registry.provider(address,{blockTag:block.number});
    if(!record.active||record.validUntil<=BigInt(block.timestamp)||(capabilities&&record.capabilities!==capabilities))continue;
    const item={address,metadataHash:record.metadataHash,uri:record.uri,capabilities:record.capabilities,revision:String(record.revision),validUntil:Number(record.validUntil),metadata:null,endpointVerified:false};
    if(fetchMetadata){const raw=await fetchMetadata(record.uri);if(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072||keccak256(toUtf8Bytes(raw))!==record.metadataHash)throw Error('Provider metadata hash mismatch');const metadata=JSON.parse(raw);if(typeof metadata.name!=='string'||metadata.name.length>120||!Array.isArray(metadata.services)||metadata.services.length>30)throw Error('Invalid provider metadata');item.metadata=metadata;}
    results.push(item);
  }
  return {block:block.number,total:String(await registry.count({blockTag:block.number})),next:start+addresses.length,providers:results};
}

/** Scores are shown only within the user's selected reviewer set. Collusion and Sybils remain possible. */
export async function providerReputation({provider,directory,address,fromBlock,toBlock,trustedReviewers}){
  if(!Array.isArray(trustedReviewers)||trustedReviewers.length===0)throw Error('Choose attributable reviewers before calculating reputation');
  if(!Number.isInteger(fromBlock)||!Number.isInteger(toBlock)||fromBlock<0||toBlock<fromBlock||toBlock-fromBlock>10000)throw Error('Feedback history must use bounded 10000-block pages');
  const trusted=new Set(trustedReviewers.map(a=>getAddress(a)));const registry=new Contract(directory,DIRECTORY_ABI,provider);
  const events=await registry.queryFilter(registry.filters.FeedbackGiven(null,address),fromBlock,toBlock);const reviews=[];
  // Query each current stored record to honor revocation outside the requested history window.
  const current=new Contract(directory,['function feedback(uint256) view returns(address provider,address reviewer,int8 score,bytes32 evidence,bool revoked)'],provider);
  for(const e of events){if(!trusted.has(getAddress(e.args.reviewer)))continue;const f=await current.feedback(e.args.jobId);if(f.revoked)continue;reviews.push({jobId:String(e.args.jobId),reviewer:e.args.reviewer,score:Number(e.args.score),evidence:e.args.evidence,transaction:e.transactionHash});}
  return {address:getAddress(address),reviews,reviewerCount:new Set(reviews.map(r=>r.reviewer)).size,average:reviews.length?reviews.reduce((n,r)=>n+r.score,0)/reviews.length:null,trust:'Attributable paid-job feedback; identities, quality and independence are not certified.'};
}

/** External ERC-8004 reference inspection uses the selected RPC; it does not turn our directory into that standard. */
export async function inspectERC8004({provider,chainId,identityRegistry,agentId}){
  if((await provider.getNetwork()).chainId!==BigInt(chainId))throw Error('ERC-8004 reference chain mismatch');
  const identity=new Contract(identityRegistry,['function ownerOf(uint256) view returns(address)','function tokenURI(uint256) view returns(string)','function getAgentWallet(uint256) view returns(address)'],provider);
  const [owner,uri,wallet]=await Promise.all([identity.ownerOf(agentId),identity.tokenURI(agentId),identity.getAgentWallet(agentId)]);
  return {chainId:String(chainId),identityRegistry:getAddress(identityRegistry),agentId:String(agentId),owner,uri,wallet,trust:'Registry ownership only; external service and reputation claims require separate verification.'};
}
