// Dependency-injected ethers v6: usable in a browser bundle and in Node.
export const PERIPHERY_COMMIT = 'dce236d4e2057422d0791d9a973a58765eb46f65';
export const PERMIT2_COMMIT = 'cc56ad0f3439c502c246fc5cfcc3db92bb8b7219';
export const ACTIONS = Object.freeze({ MINT_POSITION: 0x02, SETTLE_PAIR: 0x0d, SWEEP: 0x14 });
export const POOL_KEY_TYPE = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';

export function createPositionManagerEncoder(ethers) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const positionInterface = new ethers.Interface([
    'function modifyLiquidities(bytes unlockData,uint256 deadline) payable',
    'function poolManager() view returns (address)',
    'function permit2() view returns (address)'
  ]);
  const erc20Interface = new ethers.Interface([
    'function approve(address spender,uint256 amount) returns (bool)',
    'function allowance(address owner,address spender) view returns (uint256)'
  ]);
  const permit2Interface = new ethers.Interface([
    'function approve(address token,address spender,uint160 amount,uint48 expiration)',
    'function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)'
  ]);

  function integer(value, minimum, maximum, name) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error(`${name} must be an exact integer.`);
    const result = BigInt(value);
    if (result < minimum || result > maximum) throw new Error(`${name} is outside the supported range.`);
    return result;
  }
  function address(value, name, allowZero = false) {
    const result = ethers.getAddress(value);
    if (!allowZero && result === ethers.ZeroAddress) throw new Error(`${name} cannot be zero.`);
    return result;
  }
  function recipient(value, name) {
    const result = address(value, name);
    if (BigInt(result) <= 2n) throw new Error(`${name} must be a literal recipient, not a PositionManager sentinel.`);
    return result;
  }

  function buildMintPosition(options) {
    const positionManager = address(options.positionManager, 'PositionManager');
    const permit2 = address(options.permit2, 'Permit2');
    const chosenRecipient = recipient(options.recipient, 'Position recipient');
    const refundRecipient = recipient(options.refundRecipient, 'Refund recipient');
    const poolKey = {
      currency0: address(options.poolKey.currency0, 'Currency0', true),
      currency1: address(options.poolKey.currency1, 'Currency1'),
      fee: integer(options.poolKey.fee, 0n, (1n << 24n) - 1n, 'Pool fee'),
      tickSpacing: integer(options.poolKey.tickSpacing, 1n, 32767n, 'Tick spacing'),
      hooks: address(options.poolKey.hooks, 'Hook', true)
    };
    if (BigInt(poolKey.currency0) >= BigInt(poolKey.currency1)) throw new Error('Pool currencies must be distinct and sorted by address.');
    const tickLower = integer(options.tickLower, -887272n, 887272n, 'Lower tick');
    const tickUpper = integer(options.tickUpper, -887272n, 887272n, 'Upper tick');
    if (tickLower >= tickUpper || tickLower % poolKey.tickSpacing !== 0n || tickUpper % poolKey.tickSpacing !== 0n) {
      throw new Error('Ticks must be ordered and aligned to the pool tick spacing.');
    }
    // Core casts each liquidity change to int128 even though the periphery ABI uses uint256.
    const liquidity = integer(options.liquidity, 1n, (1n << 127n) - 1n, 'Liquidity');
    const amount0Max = integer(options.amount0Max, 0n, (1n << 128n) - 1n, 'Amount0 maximum');
    const amount1Max = integer(options.amount1Max, 0n, (1n << 128n) - 1n, 'Amount1 maximum');
    const deadline = integer(options.deadline, 1n, (1n << 48n) - 1n, 'Deadline');
    const permitExpiration = integer(options.permitExpiration ?? deadline, deadline, (1n << 48n) - 1n, 'Permit expiration');
    const hookData = options.hookData ?? '0x';
    if (!ethers.isHexString(hookData)) throw new Error('hookData must be a hex byte string.');
    const native = poolKey.currency0 === ethers.ZeroAddress;
    const actions = native ? '0x020d14' : '0x020d';
    const params = [
      coder.encode([POOL_KEY_TYPE, 'int24', 'int24', 'uint256', 'uint128', 'uint128', 'address', 'bytes'],
        [poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, chosenRecipient, hookData]),
      coder.encode(['address', 'address'], [poolKey.currency0, poolKey.currency1])
    ];
    if (native) params.push(coder.encode(['address', 'address'], [ethers.ZeroAddress, refundRecipient]));
    const unlockData = coder.encode(['bytes', 'bytes[]'], [actions, params]);
    const request = {
      to: positionManager,
      data: positionInterface.encodeFunctionData('modifyLiquidities', [unlockData, deadline]),
      value: native ? amount0Max : 0n
    };
    const approvalRequirements = [[poolKey.currency0, amount0Max], [poolKey.currency1, amount1Max]]
      .filter(([token, amount]) => token !== ethers.ZeroAddress && amount > 0n)
      .map(([token, amount]) => ({ token, amount, permit2, spender: positionManager, expiration: permitExpiration }));
    return { request, actions, params, unlockData, deadline, poolKey, liquidity, amount0Max, amount1Max,
      recipient: chosenRecipient, refundRecipient, permit2, approvalRequirements,
      verification: 'Pinned official ABI/source verified; no PositionManager mint transaction was executed by this encoder.' };
  }

  // Read-only preparation. The caller reviews and submits each returned transaction.
  async function prepareApprovals(provider, payer, plan) {
    const owner = address(payer, 'Payer');
    const transactions = [];
    for (const requirement of plan.approvalRequirements) {
      const token = new ethers.Contract(requirement.token, erc20Interface, provider);
      const permit2 = new ethers.Contract(requirement.permit2, permit2Interface, provider);
      const [tokenAllowance, delegated] = await Promise.all([
        token.allowance(owner, requirement.permit2),
        permit2.allowance(owner, requirement.token, requirement.spender)
      ]);
      if (tokenAllowance < requirement.amount) {
        if (tokenAllowance !== 0n) transactions.push({ purpose: 'Reset existing ERC20 allowance', request: {
          to: requirement.token, data: erc20Interface.encodeFunctionData('approve', [requirement.permit2, 0n]), value: 0n
        } });
        transactions.push({ purpose: 'Approve exact ERC20 maximum to Permit2', request: {
          to: requirement.token, data: erc20Interface.encodeFunctionData('approve', [requirement.permit2, requirement.amount]), value: 0n
        } });
      }
      if (delegated.amount < requirement.amount || delegated.expiration < plan.deadline) {
        transactions.push({ purpose: 'Approve bounded Permit2 spending for PositionManager', request: {
          to: requirement.permit2,
          data: permit2Interface.encodeFunctionData('approve', [requirement.token, requirement.spender, requirement.amount, requirement.expiration]), value: 0n
        } });
      }
    }
    return transactions;
  }

  return { buildMintPosition, prepareApprovals, positionInterface, erc20Interface, permit2Interface };
}
