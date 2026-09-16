"""Review tripwires and independent integer arithmetic probes, NOT Solidity tests."""
from pathlib import Path
import math,random,json,re
R=Path(__file__).resolve().parents[2]
checks=[]
def check(name,ok):
 checks.append({'name':name,'passed':bool(ok)})
 if not ok:raise AssertionError(name)
def read(f):return (R/f).read_text()
hook=read('contracts/src/kingdom/PhoenixLaunchHook.sol')
market=read('contracts/src/kingdom/V4GenesisMarket.sol')
core=read('contracts/src/core/IDontFuckingBelieveIt.sol')
account=read('contracts/src/core/SovereignAccount.sol')
exchange=read('contracts/src/kingdom/EstateExchange.sol')
world=read('contracts/src/protocol/WorldLedger.sol')
check('hook flags correspond to four declared callbacks',(1<<13)|(1<<9)|(1<<7)|(1<<6)==0x22c0)
check('hook guards actual deployed address permission bits','WrongAddressFlags()' in hook and 'uint160(address(this))&V4Boundary.ADDRESS_MASK' in hook)
check('zero-delta fee collection is not blocked by negative-principal hook','sender==market&&params.liquidityDelta<0' in hook)
check('all four enabled hook callbacks are present',all(x in hook for x in ['function beforeInitialize','function beforeRemoveLiquidity','function beforeSwap','function afterSwap']))
check('hook does not invoke the social ledger','ledger.record' not in hook)
check('adapter calls the actual manager settlement ABI',all(x in market for x in ['.unlock(','.modifyLiquidity(','.swap(','.settle(','.take(']))
check('legacy custom AMM is not imported as v4','NativeMarket' not in market)
check('ERC4906 event parameters are not indexed',bool(re.search(r'event MetadataUpdate\(uint256\s+\w+\)',core)) and bool(re.search(r'event BatchMetadataUpdate\(uint256\s+\w+,\s*uint256\s+\w+\)',core)))
check('ERC4906 interface advertised','0x49064906' in core)
check('account internal call accepts constructed memory bytes',bool(re.search(r'function _call\([^)]*bytes memory',account)))
check('exchange has no general execution or signature surface','function execute(' not in exchange and 'function isValidSignature(' not in exchange)
check('social source stores original custody and epoch','struct Attribution' in world and 'invitationEpoch' in world and 'moderatorEpoch' in world)
# Independent translation of the new integer square-root algorithm, compared to Python's isqrt.
def sqrt(x):
 if x==0:return 0
 r=1<<((x.bit_length()+1)//2)
 for _ in range(8):r=(r+x//r)//2
 return min(r,x//r)
rng=random.Random(1400)
values=[0,1,2,3,4,8,9,15,16,17,(1<<256)-1]+[rng.getrandbits(rng.randrange(1,257)) for _ in range(5000)]
check('translated integer sqrt agrees with independent math.isqrt on 5011 inputs',all(sqrt(n)==math.isqrt(n) for n in values))
# No gas, overflow semantics, ticks, callbacks, or deployment are exercised by this probe.
report={'scope':'SOURCE-TEXT TRIPWIRES AND TRANSLATED ARITHMETIC ONLY; NOT COMPILE OR EVM EXECUTION','checks':checks,'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'arithmeticInputs':len(values)}
(R/'reports/v1.4/source-boundaries.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
