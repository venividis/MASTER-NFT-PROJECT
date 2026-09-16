const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, dependency } = require('../scripts/compile.cjs');
const ganache = dependency('ganache');
const ethers = dependency('ethers');

async function main() {
  // Isolated in-memory chain only. No external RPC or funded wallet is used.
  const local = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { deterministic: true, totalAccounts: 5 }
  });
  const provider = new ethers.BrowserProvider(local);
  provider.pollingInterval = 10;
  const creator = await provider.getSigner(0);
  const buyer = await provider.getSigner(1);
  const recipient = await provider.getSigner(2);
  const newOwner = await provider.getSigner(3);
  const a = await creator.getAddress();
  const b = await buyer.getAddress();
  const r = await recipient.getAddress();
  const n = await newOwner.getAddress();
  const checks = [];
  function checked(name) { checks.push(name); console.log('PASS ' + name); }
  const artifact = name => JSON.parse(fs.readFileSync(path.join(root, 'artifacts', name + '.json'), 'utf8'));
  async function deploy(name, args = []) {
    const compiled = artifact(name);
    const deployed = await new ethers.ContractFactory(compiled.abi, compiled.bytecode, creator).deploy(...args);
    await deployed.waitForDeployment();
    return deployed;
  }
  async function mined(promise) { return (await promise).wait(); }
  async function balance(address) { return BigInt(await provider.send('eth_getBalance', [address, 'latest'])); }
  async function rejects(call) { await assert.rejects(call); }

  try {
    const rootNFT = await deploy('AWEArtifact');
    const cartridges = await deploy('CartridgeRegistry', [await rootNFT.getAddress()]);
    const items = await deploy('CreatorItems');
    const payment = await deploy('TestPaymentToken');
    assert.equal(await rootNFT.supportsInterface('0x80ac58cd'), true);
    assert.equal(await cartridges.supportsInterface('0x49064906'), true);
    assert.equal(await items.supportsInterface('0xd9b67a26'), true);
    checked('deployed NFT, cartridge and item contracts expose their declared interfaces');

    await mined(rootNFT.mint(a, 'data:application/json,{"name":"Creator world"}'));
    const accountAddress = await rootNFT.accountFor(1);
    const account = new ethers.Contract(accountAddress, artifact('ArtifactAccount').abi, creator);
    assert.equal(await rootNFT.ownerOf(1), a);
    assert.equal(await account.owner(), a);
    assert.equal(await account.ownershipEpoch(), 1n);
    assert.equal(await rootNFT.artifactIdOfAccount(accountAddress), 1n);
    checked('mint creates the parent NFT and its owner-controlled custody account');

    const executable = ethers.toUtf8Bytes('<!doctype html><title>Onchain mini game</title><button>Play</button>');
    const hash = ethers.sha256(executable);
    const manifest = JSON.stringify({
      name: 'Onchain Mini Game', schema: 'awe.cartridge/1', runtime: 'html',
      content: { sha256: hash, source: 'contract' }, capabilities: ['input.keyboard'],
      multiplayer: { mode: 'local' }
    });
    await mined(cartridges.mint(accountAddress, manifest, hash));
    const launch = await cartridges.launchManifest(1, a);
    assert.equal(launch.authorized, true);
    assert.equal(launch.parentArtifactId, 1n);
    assert.equal(launch.parentOwnershipEpoch, 1n);
    assert.equal(launch.holder, accountAddress);
    assert.equal(launch.contentHash, hash);
    assert.equal(await cartridges.canLaunch(1, b), false);
    assert.equal(Buffer.from((await cartridges.tokenURI(1)).split(',')[1], 'base64').toString(), manifest);
    checked('cartridge nested in the parent account resolves launch ownership and onchain metadata');

    await mined(account.execute(await cartridges.getAddress(), 0,
      cartridges.interface.encodeFunctionData('publishContent', [1, executable])));
    assert.equal(await cartridges.contentOf(1), ethers.hexlify(executable));
    assert.equal((await cartridges.launchManifest(1, a)).onchainContentAvailable, true);
    checked('parent owner publishes hash-matched executable bytes entirely into chain storage');

    const challenge = ethers.keccak256(ethers.toUtf8Bytes('localhost:play:challenge-1:expiry-2000000000'));
    const digest = await account.signatureDigest(challenge);
    const localSecret = local.getInitialAccounts()[a.toLowerCase()].secretKey;
    const signature = new ethers.SigningKey(localSecret).sign(digest).serialized;
    assert.equal(await account.isValidSignature(challenge, signature), '0x1626ba7e');
    await mined(rootNFT.transferFrom(a, n, 1));
    assert.equal(await account.owner(), n);
    assert.equal(await account.ownershipEpoch(), 2n);
    assert.equal(await cartridges.canLaunch(1, n), true);
    assert.equal(await cartridges.canLaunch(1, a), false);
    assert.equal(await account.isValidSignature(challenge, signature), '0xffffffff');
    await mined(rootNFT.connect(newOwner).transferFrom(n, a, 1));
    assert.equal(await account.ownershipEpoch(), 3n);
    assert.equal(await account.isValidSignature(challenge, signature), '0xffffffff');
    checked('parent ownership transfer updates launch authority and invalidates old epoch signatures, including return transfer');

    const nextExecutable = ethers.toUtf8Bytes('<!doctype html><title>Onchain mini game v2</title><button>Play again</button>');
    const nextHash = ethers.sha256(nextExecutable);
    const nextManifest = JSON.stringify({ name: 'Onchain Mini Game v2', schema: 'awe.cartridge/1', runtime: 'html' });
    await mined(account.execute(await cartridges.getAddress(), 0,
      cartridges.interface.encodeFunctionData('updateManifest', [1, nextManifest, nextHash])));
    assert.equal((await cartridges.manifestOf(1)).revision, 2n);
    assert.equal(await cartridges.contentOf(1), '0x');
    await mined(account.execute(await cartridges.getAddress(), 0,
      cartridges.interface.encodeFunctionData('freezeManifest', [1])));
    await mined(account.execute(await cartridges.getAddress(), 0,
      cartridges.interface.encodeFunctionData('publishContent', [1, nextExecutable])));
    assert.equal((await cartridges.manifestOf(1)).frozen, true);
    assert.equal(await cartridges.contentOf(1), ethers.hexlify(nextExecutable));
    checked('manifest revisions clear stale content and optional freeze preserves the executable commitment');

    const nativePrice = ethers.parseEther('0.01');
    await mined(items.createItem('data:application/json,{"name":"Creator sword"}', ethers.ZeroAddress, nativePrice, r, 20));
    const receiverBefore = await balance(r);
    await mined(items.connect(buyer).mintItem(1, accountAddress, 3, ethers.ZeroAddress, 1, nativePrice * 3n,
      { value: nativePrice * 3n }));
    assert.equal((await balance(r)) - receiverBefore, nativePrice * 3n);
    assert.equal(await items.balanceOf(accountAddress, 1), 3n);
    assert.equal((await items.item(1)).minted, 3n);
    checked('native-currency item sale pays the creator-selected receiver and deposits items in the NFT account');

    const tokenPrice = 200n;
    await mined(payment.mint(b, 10000));
    await mined(payment.connect(buyer).approve(await items.getAddress(), 10000));
    await mined(items.configureSale(1, await payment.getAddress(), tokenPrice, r, true));
    await mined(items.connect(buyer).mintItem(1, b, 5, await payment.getAddress(), 2, 1000));
    assert.equal(await payment.balanceOf(r), 1000n);
    assert.equal(await items.balanceOf(b, 1), 5n);
    assert.equal((await items.item(1)).minted, 8n);
    await rejects(items.connect(buyer).mintItem.staticCall(1, b, 1, await payment.getAddress(), 1, 200));
    checked('creator can switch to a chosen ERC20 and buyers pin payment terms to their reviewed quote');

    await mined(account.execute(await items.getAddress(), 0,
      items.interface.encodeFunctionData('safeTransferFrom', [accountAddress, n, 1, 1, '0x'])));
    assert.equal(await items.balanceOf(n, 1), 1n);
    assert.equal(await items.balanceOf(accountAddress, 1), 2n);
    checked('parent owner executes an ordinary item transfer from NFT custody');

    await mined(creator.sendTransaction({ to: accountAddress, value: ethers.parseEther('0.05') }));
    const beforeWithdrawal = await balance(r);
    await mined(account.execute(r, ethers.parseEther('0.02'), '0x'));
    assert.equal((await balance(r)) - beforeWithdrawal, ethers.parseEther('0.02'));
    checked('parent account receives and sends native currency through owner execution');

    const result = {
      passed: checks.length, failed: 0, checks,
      environment: 'Ganache 7.9.2 isolated in-memory EVM, chain 31337, Shanghai',
      compiler: artifact('AWEArtifact').compiler,
      scope: 'Normal deployment, custody, ownership, manifest, signature epoch and payment flows. No live-chain transaction or audit claim.'
    };
    fs.writeFileSync(path.join(root, 'test-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
  } finally {
    await local.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
