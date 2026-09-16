/*  Hardhat is here for exactly one thing: `npx hardhat node`, a local
    testnet with real blocks, real receipts and a real eth_getLogs, so the
    deployment and the site can be exercised over a wire instead of
    in-process. Compilation stays with tools/compile.mjs — `sources` points
    at an empty directory so hardhat never reaches for a compiler of its
    own (and never reaches for the network to fetch one).                */
module.exports = {
  solidity: "0.8.28",
  paths: { sources: "./.hh-empty" },
  networks: {
    hardhat: {
      chainId: 31337,
      /*  Cancun, explicitly — the hardfork the contracts are compiled for.
          Left to default, hardhat runs Osaka rules, where EIP-7825 caps a
          transaction at 2^24 gas and this node applies that cap to
          eth_call as well: tokenURI() at 19.99M then fails with a bare
          revert while every page of the site still answers. That is a
          finding about the future, not a bug in the node — see the README
          on what the Fusaka cap means for readers of this collection.  */
      hardfork: "cancun",
      mining: { auto: true },
      initialBaseFeePerGas: 1_000_000_000
    }
  }
};
