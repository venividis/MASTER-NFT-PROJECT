// SPDX-License-Identifier: MIT
// Integer TickMath port from the pinned Uniswap v4 source included in integrations/console.
export const Q96=1n<<96n;
export const MIN_SQRT=4295128739n;
export const MAX_SQRT=1461446703485210103287273052203988822378723970342n;
const powers=[0xfffcb933bd6fad37aa2d162d1a594001n,0xfff97272373d413259a46990580e213an,0xfff2e50f5f656932ef12357cf3c7fdccn,0xffe5caca7e10e4e61c3624eaa0941cd0n,0xffcb9843d60f6159c9db58835c926644n,0xff973b41fa98c081472e6896dfb254c0n,0xff2ea16466c96a3843ec78b326b52861n,0xfe5dee046a99a2a811c461f1969c3053n,0xfcbe86c7900a88aedcffc83b479aa3a4n,0xf987a7253ac413176f2b074cf7815e54n,0xf3392b0822b70005940c7a398e4b70f3n,0xe7159475a2c29b7443b29c7fa6e889d9n,0xd097f3bdfd2022b8845ad8f792aa5825n,0xa9f746462d870fdf8a65dc1f90e061e5n,0x70d869a156d2a1b890bb3df62baf32f7n,0x31be135f97d08fd981231505542fcfa6n,0x9aa508b5b7a84e1c677de54f3e99bc9n,0x5d6af8dedb81196699c329225ee604n,0x2216e584f5fa1ea926041bedfe98n,0x48a170391f7dc42444e8fa2n];
export function sqrtAtTick(tick){
 if(!Number.isSafeInteger(tick)||Math.abs(tick)>887272)throw Error('Tick is outside the v4 range.');
 const absolute=Math.abs(tick);let p=1n<<128n;
 for(let i=0;i<powers.length;i++)if(absolute&(1<<i))p=p*powers[i]>>128n;
 if(tick>0)p=((1n<<256n)-1n)/p;
 return (p+(1n<<32n)-1n)>>32n;
}
export function integerSqrt(n){if(n<0n)throw Error('Negative square root.');if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));for(;;){const y=(x+n/x)>>1n;if(y>=x)return x;x=y;}}
export function decimalRatio(value){const s=String(value).trim();if(!/^\d{1,40}(\.\d{1,36})?$/.test(s))throw Error('Enter a positive decimal price, without exponent notation.');const [a,b='']=s.split('.');const n=BigInt(a+b);if(n===0n)throw Error('Price must be positive.');return [n,10n**BigInt(b.length)];}
export function startingPrice(quotePerToken,quoteDecimals,tokenIs0){
 if(!Number.isInteger(quoteDecimals)||quoteDecimals<0||quoteDecimals>36)throw Error('Unsupported quote decimals.');
 let [n,d]=decimalRatio(quotePerToken);n*=10n**BigInt(quoteDecimals);d*=10n**18n;if(!tokenIs0)[n,d]=[d,n];
 const result=integerSqrt((n<<192n)/d);if(result<=MIN_SQRT||result>=MAX_SQRT)throw Error('Price is outside the v4 range.');return result;
}
function tickAtPrice(sqrt){let lo=-887272,hi=887272;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(sqrtAtTick(mid)<=sqrt)lo=mid;else hi=mid-1;}return lo;}
// Quote per newly minted (18 decimal) token. Currency ordering must come from the
// token predicted for the actual payer, including a private execution adapter.
export function resolveHumanRange(range,quoteDecimals,tokenIs0,spacing){
 if(!Number.isSafeInteger(spacing)||spacing<1||spacing>32767)throw Error('Invalid tick spacing.');
 const minimum=Math.ceil(-887272/spacing)*spacing,maximum=Math.floor(887272/spacing)*spacing;
 if(!range||range.mode==='full')return {tickLower:minimum,tickUpper:maximum};
 if(typeof range!=='object'||Array.isArray(range)||(range.mode&&range.mode!=='custom'))throw Error('Invalid human price range.');
 const lower=range.lower??range.min,upper=range.upper??range.max;
 const a=startingPrice(lower,quoteDecimals,tokenIs0),b=startingPrice(upper,quoteDecimals,tokenIs0);
 if((tokenIs0&&a>=b)||(!tokenIs0&&a<=b))throw Error('The lower human price must be below the upper price.');
 const p0=a<b?a:b,p1=a<b?b:a,lowerFloor=tickAtPrice(p0),upperFloor=tickAtPrice(p1);
 const upperCeiling=sqrtAtTick(upperFloor)<p1?upperFloor+1:upperFloor;
 const tickLower=Math.floor(lowerFloor/spacing)*spacing,tickUpper=Math.ceil(upperCeiling/spacing)*spacing;
 if(tickLower<minimum||tickUpper>maximum)throw Error('The human price limits exceed the usable range for this tick spacing.');
 if(tickLower>=tickUpper)throw Error('This price range is too narrow for the selected tick spacing.');
 return {tickLower,tickUpper};
}
export function liquidityForBudgets(p,a,b,amount0,amount1){
 if(a>=b)throw Error('Invalid price range.');const l0=(x,y,v)=>v*((x*y)/Q96)/(y-x);const l1=(x,y,v)=>v*Q96/(y-x);
 const l=p<=a?l0(a,b,amount0):p>=b?l1(a,b,amount1):[l0(p,b,amount0),l1(a,p,amount1)].reduce((x,y)=>x<y?x:y);
 if(l<=0n||l>(1n<<127n)-1n)throw Error('Budgets produce unsupported liquidity.');return l;
}
export function unshieldGross(net,feeBps){net=BigInt(net);feeBps=BigInt(feeBps);if(net<=0n||feeBps<0n||feeBps>=10000n)throw Error('Invalid shielded amount or protocol fee.');return (net*10000n+9999n-feeBps)/(10000n-feeBps);}
