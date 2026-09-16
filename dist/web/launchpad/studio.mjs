import {defaults,decimal,number,units,validateIdentity,poolModel,poolTrade,saleTerms,saleComposition,saleModel,saleAllocation,feeFlow,exportPlan,hydrateDraft} from './model.mjs';
import {replayPool,replaySale,scenarioJSON} from './scenarios.mjs';
import {sealPrivateData,openSealedData} from '../privacy/vault.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,digits=6)=>{
  const n=Number(v);
  if(!Number.isFinite(n))return '—';
  if(n!==0&&Math.abs(n)<0.000001)return n.toExponential(3);
  return n.toLocaleString('en-US',{maximumFractionDigits:digits});
};
const show=(n,d=18)=>fmt(number(n,d));
const stat=(label,value,sub='')=>`<div class="lp-stat"><span>${esc(label)}</span><strong>${value}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
const row=(label,value)=>`<div class="lp-fact"><span>${esc(label)}</span><strong>${value}</strong></div>`;
const button=(action,label,cls='')=>`<button type="button" class="lp-button ${cls}" data-lp-action="${action}">${label}</button>`;
const title=(n,heading,copy)=>`<div class="lp-section-heading"><span>${n}</span><div><h3>${heading}</h3>${copy?`<p>${copy}</p>`:''}</div></div>`;
const labels=['Identity','Market','Alchemy','Review'];
const marketModel=d=>poolModel(d,d.scenarioTokenOrder!=='token1');
const symbol=d=>esc(d.symbol||'TOKEN'),quote=d=>esc(d.quoteSymbol||'QUOTE');

export class LaunchStudio {
  constructor(){this.d=defaults();this.step=0;this.root=null;this.context=null;this.abort=null;this.generation=0;this.busy=false;this.file=null;this.dialog=null;this.saved=false;this.baseline=null;}
  render(context){
    this.unmount();
    if(this.context?.seed&&context.seed!==this.context.seed){this.d=defaults();this.step=0;this.baseline=null;this.saved=false;}
    this.configure(context);
    return this.html();
  }
  configure(context={}){
    this.context=context;
    const first=this.d.recipients[0];
    if(first&&!first.recipient&&/^0x[\da-f]{40}$/i.test(context.address||'')&&!/^0x0{40}$/i.test(context.address)){first.recipient=context.address;if(!first.label)first.label='Creator';}
    return this;
  }
  changed(){this.saved=false;this.context?.onDraftChange?.(structuredClone(this.d));}
  unmount(){this.abort?.abort();this.abort=null;this.root=null;this.generation++;this.busy=false;}
  field(key,label,{help='',type='text',min,max,step,placeholder='',value=this.d[key]}={}){
    const id='lp-'+key;
    return `<div class="lp-field"><label for="${id}">${label}</label><input id="${id}" data-lp-field="${key}" type="${type}" value="${esc(value)}" ${type==='text'&&!['name','symbol','purpose','quoteSymbol','quoteToken'].includes(key)?'inputmode="decimal"':''} ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''} ${step!==undefined?`step="${step}"`:''} ${placeholder?`placeholder="${esc(placeholder)}"`:''} autocomplete="off" ${help?`aria-describedby="${id}-help"`:''}>${help?`<small id="${id}-help">${help}</small>`:''}</div>`;
  }
  choice(key,options){return `<div class="lp-choices" role="group" aria-label="${esc(key)}">${options.map(([value,name,copy])=>`<button type="button" data-lp-choice="${key}:${value}" aria-pressed="${this.d[key]===value}"><span>${name}</span>${copy?`<small>${copy}</small>`:''}</button>`).join('')}</div>`;}
  html(){
    return `<div class="lp-studio"><div class="lp-toolbar"><span class="lp-wordmark">ANIMA <i>✧</i> CREATION STUDIO</span><div>${button('save','Save draft')}${button('restore','Restore')}</div></div>
      ${this.dialog?this.fileDialog():''}
      <nav class="lp-steps" aria-label="Launch design steps">${labels.map((name,i)=>`<button type="button" data-lp-step="${i}" ${this.step===i?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span>${name}</button>`).join('')}</nav>
      <div class="lp-layout"><section class="lp-main" aria-label="${labels[this.step]}">${[()=>this.identity(),()=>this.market(),()=>this.alchemy(),()=>this.review()][this.step]()}
      <p id="lp-message" class="lp-message" role="status" aria-live="polite"></p><div class="lp-bottom">${this.step?button('back','← Back'):''}${this.step<3?button('next',`Continue to ${labels[this.step+1]} <span>↗</span>`,'lp-primary'):''}</div></section>
      <aside class="lp-summary" aria-label="Launch composition"><div id="lp-composition">${this.composition()}</div><div class="lp-aside-note"><span>✧</span><p>${this.d.mode==='pool'?'Price, capital and range describe different things. Watch how one change reshapes the others.':'One closing price. Every participant receives a share proportional to their contribution.'}</p></div></aside></div>
      ${this.context?.salesHTML?`<details class="lp-existing"><summary>Your community sales <span>${this.context.saleCount||0}</span></summary><div>${this.context.salesHTML}</div></details>`:''}
      <input type="file" id="lp-import" accept=".json,application/json" hidden>
    </div>`;
  }
  identity(){return `${title('01','Give it a beginning.','Start with what you are creating. Every market choice comes next.')}
    ${this.choice('mode',[['pool','Instant v4 pool','Fund a market at your chosen opening price.'],['sale','Community sale','Gather contributions, then settle at one price.']])}
    <div class="lp-fields lp-name-fields">${this.field('name','Token name',{placeholder:'Your idea, named'})}${this.field('symbol','Symbol',{placeholder:'TICKER'})}</div>
    ${this.field('supply','Total token supply',{help:'Fixed supply. The instant-pool token has no later mint function.'})}
    <div class="lp-field"><label for="lp-purpose">What is it for? <span class="lp-optional">Optional</span></label><textarea id="lp-purpose" data-lp-field="purpose" rows="3" maxlength="2000" placeholder="The idea your community will gather around…">${esc(this.d.purpose)}</textarea><small>${this.d.mode==='sale'?'Included in the onchain sale inscription. Up to 1,024 UTF-8 bytes; visible publicly.':'Kept in your draft. The v4 token contract does not store this description.'}</small></div>
    <div class="lp-line-note">${this.d.mode==='pool'?'You choose the price, liquidity and fee. Unused token supply stays with the launch recipient.':'You choose the raise and duration. Contributors can withdraw before closing; a failed raise is refundable.'}</div>`;}
  market(){const d=this.d;
    if(d.mode==='sale')return `${title('02','Make the terms clear.','Shape the raise and the commitments your community will see.')}
      <div class="lp-fields">${this.field('soft','Minimum raise · ETH')}${this.field('hard','Maximum raise · ETH')}</div>
      ${this.field('hours','Contribution window · hours',{type:'number',min:1,max:720,help:'1–720 hours. Opening is scheduled five minutes after preparation; submit before it opens. Exact times appear in the transaction review.'})}
      <div class="lp-fields">${this.field('founderPercent','Founder tokens · %',{help:'0–20% of supply under this sale contract. Linear vesting with a 30-day cliff.'})}${this.field('liquidityPercent','Raise to liquidity · %',{help:'50–100% under this sale contract. Remaining ETH is locked for the chosen vesting duration.'})}</div>
      ${this.field('vestingDays','Founder vesting & treasury lock · days',{type:'number',min:30,max:1825,step:1,help:'30–1,825 days from successful settlement. Founder tokens vest linearly with a 30-day cliff; treasury ETH releases at the end.'})}
      <div class="lp-timeline"><div><b>Raise</b><span>Contribute or withdraw</span></div><div><b>Close</b><span>Settle or refund</span></div><div><b>Release</b><span>Claim tokens; vest over time</span></div></div>
      <p class="lp-note">This sale settles into the existing Genesis market. Its launch room, contributions and description are public; it is separate from the instant Uniswap v4 pool path.</p>`;
    return `${title('02','Shape the market.','Set the price and the capital that supports it.')}
      <div class="lp-asset-shortcuts"><span>Fill asset details</span>${button('asset:WETH','WETH · 18 decimals')}${button('asset:USDC','USDC · 6 decimals')}</div>
      <div class="lp-fields">${this.field('quoteSymbol','Paired asset',{help:'Any standard ERC20. Asset shortcuts fill labels and decimals only; verify the contract before launch.'})}${this.field('price',`Opening price · ${quote(d)} per token`)}</div>
      <div class="lp-fields">${this.field('tokenBudget',`Maximum ${symbol(d)} for liquidity`)}${this.field('quoteBudget',`Maximum ${quote(d)} to fund`)}</div>
      <h4>Where should liquidity work?</h4>${this.choice('range',[['full','Full range','Available across the supported price range.'],['custom','Concentrated range','Focus capital between two prices.']])}
      ${d.range==='custom'?`<div class="lp-fields">${this.field('lowerPrice',`Lower price · ${quote(d)}`)}${this.field('upperPrice',`Upper price · ${quote(d)}`)}</div><div id="lp-range-detail">${this.rangeDetail()}</div>`:''}
      ${this.field('feePercent','Trading fee to liquidity owners · %',{help:'Choose any supported rate from 0–10%. 0.30% means 0.003 of each swap input before any protocol fee.'})}
      <details class="lp-advanced"><summary>Asset details & exact settings</summary><div class="lp-fields">${this.field('quoteDecimals','Paired asset decimals',{type:'number',min:0,max:36,help:'18 for WETH; 6 for many stablecoins. Verify against the token contract before launch.'})}${this.field('tickSpacing','Tick spacing',{type:'number',min:1,max:32767,help:'The spacing between allowed range boundaries. Independent of the fee in v4.'})}</div>${this.field('quoteToken','Paired token contract · optional while designing',{placeholder:'0x…',help:'No token address or deployment is assumed. The connected launch client must verify this address.'})}<p class="lp-note">Human-price limits are rounded outward to usable ticks. Exact ticks must be resolved again after the new token address is predicted.</p></details>`;
  }
  alchemy(){const d=this.d;
    if(d.mode==='sale')return `${title('03','See the idea take form.','Explore a successful raise—or what happens if it falls short.')}
      ${this.field('raised','What if the total raise is… ETH')}${this.field('contribution','Your example contribution · ETH')}
      <div id="lp-scenario">${this.scenario()}</div>
      <div class="lp-line-note">This changes the example, not the sale clock or anyone’s balance.</div>${this.replayEditor()}`;
    return `${title('03','Alchemy, with consequences.','Change one ingredient. See what the market gives back.')}
      <details class="lp-ingredients"><summary>Adjust the ingredients here</summary><div class="lp-fields">${this.field('quoteBudget',`Maximum ${quote(d)} to fund`)}${this.field('tokenBudget',`Maximum ${symbol(d)} for liquidity`)}</div><div class="lp-fields">${this.field('price',`Opening price · ${quote(d)} per token`)}${this.field('feePercent','LP fee · %')}</div><p class="lp-note">The trade below recalculates as you edit. Change the price range in Market.</p></details>
      <div class="lp-experiment"><div class="lp-experiment-head"><h4>Try the first trade</h4><span>One funded position</span></div>
      ${this.choice('direction',[['buy',`Buy ${symbol(d)}`],['sell',`Sell ${symbol(d)}`]])}
      ${this.field('tradeAmount',`Spend ${d.direction==='buy'?quote(d):symbol(d)}`)}
      <div id="lp-scenario">${this.scenario()}</div></div>
      <div class="lp-compare-bar">${button('baseline',this.baseline?'Replace comparison':'Keep this as a comparison')}<span>${this.baseline?'Your saved comparison stays fixed while you edit.':'Keep a point of reference, then edit the market.'}</span></div>
      <div id="lp-comparison">${this.comparison()}</div>
      <p class="lp-note">Calculated from this position’s liquidity and fee. Other pools, routing, protocol fees, gas and market activity are excluded. This is not a live quote or a price forecast. <a href="https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/lp-calculations" target="_blank" rel="noopener noreferrer">Liquidity mathematics ↗</a></p>
      ${this.replayEditor()}
      <details class="lp-advanced" ${d.hookEnabled?'open':''}><summary>Share additional creator fees</summary>
      <p>Attach the supported fee hook to your pool and split its additional fees among recipients you choose. Preparation checks the hook and splitter setup before creating the pool.</p>
      <label class="lp-check"><input type="checkbox" data-lp-field="hookEnabled" ${d.hookEnabled?'checked':''}> Launch with a creator-fee hook</label>
      ${d.hookEnabled?`${this.field('hookPercent','Additional hook fee · %',{help:'0–99.9999% under the supported hook. This input-asset charge is deducted before the LP fee. Both the first trade and event replay include it.'})}
      <div class="lp-recipient-list">${d.recipients.map((r,i)=>`<div class="lp-recipient"><div><h5>Recipient ${i+1}</h5>${d.recipients.length>1?button('remove:'+i,'Remove'):''}</div><div class="lp-fields"><div class="lp-field"><label for="lp-label-${i}">Label</label><input id="lp-label-${i}" data-lp-recipient="${i}:label" value="${esc(r.label)}" placeholder="Name this destination"></div><div class="lp-field"><label for="lp-weight-${i}">Relative weight</label><input id="lp-weight-${i}" inputmode="numeric" data-lp-recipient="${i}:weight" value="${esc(r.weight)}"></div></div><div class="lp-field"><label for="lp-recipient-${i}">Recipient address</label><input id="lp-recipient-${i}" data-lp-recipient="${i}:recipient" value="${esc(r.recipient)}" placeholder="0x…" spellcheck="false"></div></div>`).join('')}</div>
      ${d.recipients.length<64?button('add','+ Add a recipient'):''}<div id="lp-fee-flow">${this.flows()}</div><p class="lp-note">Fees accrue in each swap input asset. Recipients claim that asset; no conversion is applied. Launch preparation verifies the hook and splitter before public or shielded pool funding. Hook ownership, recipient addresses and weights remain public, and the owner controls future hook configuration.</p>`:''}</details>`;
  }
  review(){const d=this.d;let content;
    try{
      const m=d.mode==='pool'?marketModel(d):saleComposition(d);
      content=d.mode==='pool'?`
        <div class="lp-review-identity"><span>${esc(d.symbol.slice(0,2))}</span><div><h4>${esc(d.name)}</h4><p>${symbol(d)} · Fixed supply</p></div></div>
        ${row('Total supply',`${show(m.supply)} ${symbol(d)}`)}${row('Opening price',`${fmt(m.price)} ${quote(d)}`)}
        ${row('Enters liquidity',`${show(m.usedToken)} ${symbol(d)} + ${show(m.usedQuote,m.qd)} ${quote(d)}`)}
        ${row('Retained supply',`${show(m.retained)} ${symbol(d)}`)}${row('Unused quote returned',`${show(m.quoteRefund,m.qd)} ${quote(d)}`)}
        ${row('LP fee',`${fmt(m.fee/10000,4)}%`)}${row('Price range',d.range==='full'?'Full supported range':`${fmt(m.lowerPrice)} — ${fmt(m.upperPrice)} ${quote(d)}`)}
        <h4 class="lp-space">How will you fund it?</h4>${this.choice('funding',[['private','Shielded funds','Use the configured RAILGUN path.'],['public','Public wallet','Fund directly from a signing wallet.']])}
        <div class="lp-privacy-scope"><b>${d.funding==='private'?'Shield the funding path.':'A public funding path.'}</b><p>${d.funding==='private'?'The canonical route can shield funding and receive new tokens, LP shares and refunds privately. It needs a connected, funded private wallet and its proof services. It never falls back to public funding.':'The funding wallet and its transaction are visible. You review approvals and the exact launch call before signing.'}</p><div>${row('Token, pool, amounts, price & timing','Public')}${row('Funding route',d.funding==='private'?'Shielded route requested':'Public')}${row('Signing account',this.context?.address?esc(this.context.address):'Connect in the launch desk')}</div></div>
        <div class="lp-contract-facts"><h4>What this token will allow</h4><p>Fixed supply. No later minting, transfer tax, token pause or blocklist. Redeemable LP shares belong to their recipient; they are not automatically locked. Retained tokens are not automatically vested.</p>${d.hookEnabled?'<p class="lp-attention">The launch sequence verifies or deploys the hook and recipient splitter before attaching them to this pool. Shielded funding supports the selected verified creator-fee hook; hook ownership, recipients and weights remain public and can link launches.</p>':''}</div>`:
        `<h4>${esc(d.name)} · ${symbol(d)}</h4>${row('Supply',show(m.supply))}${row('Community tokens',show(m.publicTokens))}${row('Liquidity tokens',show(m.lp))}${row('Founder tokens',show(m.founder))}${row('Raise range',`${show(m.soft)}–${show(m.hard)} ETH`)}${row('Window',`${m.hours} hours`)}${row('Founder vesting',`${m.vestingDays} days · 30-day cliff`)}${row('Treasury lock',`${m.vestingDays} days`)}${row('Funding & launch room','Public')}<div class="lp-line-note">Below the minimum, participants claim refunds. After a successful close, they claim tokens; founder tokens vest and the remaining treasury ETH stays locked.</div>`;
    }catch(e){content=`<p class="lp-error">${esc(e.message)}</p>`;}
    return `${title('04','Know what you are creating.','Review the composition and the permissions that come with it.')}<div class="lp-review">${content}</div>
      <div class="lp-execution"><b>Turn these terms into an onchain launch.</b><p>${d.mode==='pool'?(d.funding==='private'?'Continue to the private execution desk to prepare shielded funding and its proof. Pool details, amounts, timing and external transfers remain public.':d.hookEnabled?'Prepare the hook, recipients and pool as a reviewed sequence. Each required transaction shows its destination, permissions and funding before you sign.':'Verify the launch deployment and paired token, then review funding approvals and pool creation before signing.'):'Prepare the sale with this allocation, funding window, vesting duration and public description. The signing review resolves the actual chain times and contract arguments.'}</p>
      <div class="lp-actions">${button('launch','Prepare onchain launch ↗','lp-primary')}${button('save','Save encrypted draft')}</div><details><summary>Keep a readable copy</summary><p>This JSON is not encrypted. It saves the design and does not send a transaction.</p>${button('export','Export readable plan')}</details></div>
      <details class="lp-advanced"><summary>Before an Ethereum launch</summary><ol class="lp-readiness"><li><b>Verify deployment</b><span>Factory, router, PoolManager and token metadata must match the selected chain.</span></li><li><b>Prepare exact terms</b><span>Predict addresses, resolve token order and range ticks, set deadline and calculate required funding.</span></li><li><b>Review funding</b><span>Review wallet approvals or private proof and fee requirements.</span></li><li><b>Confirm & reconcile</b><span>Only a confirmed transaction establishes a launched token and funded position.</span></li></ol></details>`;
  }
  composition(){
    const d=this.d;
    try{
      const m=d.mode==='pool'?marketModel(d):saleComposition(d);
      const supply=m.supply,parts=d.mode==='pool'?[['Liquidity',m.usedToken,'#8cf2e6'],['Retained',m.retained,'#b5a6ff']]:[['Community',m.publicTokens,'#8cf2e6'],['Liquidity',m.lp,'#8daeff'],['Founder',m.founder,'#eac590']];
      const circumference=2*Math.PI*69;let offset=0;
      const segments=parts.map(([name,n,color])=>{const fraction=Number(n*1000000n/supply)/1000000,length=fraction*circumference,start=offset;offset+=length;return `<circle r="69" cx="96" cy="96" fill="none" stroke="${color}" stroke-width="12" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-start}" transform="rotate(-90 96 96)"/>`;}).join('');
      return `<div class="lp-summary-head"><span>THE COMPOSITION</span><b>${d.mode==='pool'?'INSTANT POOL':'COMMUNITY SALE'}</b></div>
      <div class="lp-allocation"><svg viewBox="0 0 192 192" role="img" aria-label="Supply allocation: ${parts.map(([label,n])=>`${label} ${fmt(Number(n*1000000n/supply)/10000,2)} percent`).join(', ')}"><circle r="69" cx="96" cy="96" fill="none" stroke="#ffffff0b" stroke-width="12"/>${segments}<circle r="49" cx="96" cy="96" fill="none" stroke="#d9e6ff13" stroke-width="1"/></svg><div><strong>${symbol(d)}</strong><span>${fmt(number(supply),2)} tokens</span></div></div>
      <div class="lp-legend">${parts.map(([label,n,color])=>`<div><i style="background:${color}"></i><span>${label}</span><strong>${fmt(Number(n*1000000n/supply)/10000,2)}%</strong></div>`).join('')}</div>
      ${d.mode==='pool'?`<div class="lp-summary-metrics">${stat('Opening price',`${fmt(m.price)} <em>${quote(d)}</em>`)}${stat('Position at opening',`${fmt(m.positionValue)} <em>${quote(d)}</em>`,'Value of the two funded assets at the opening price.')}${stat('Implied full valuation',`${fmt(m.fdv)} <em>${quote(d)}</em>`,'Supply × opening price. Not money raised.')}</div>${m.quoteRefund>0n?`<p class="lp-refund">↩ ${show(m.quoteRefund,m.qd)} ${quote(d)} remains unused.</p>`:''}${!m.active?'<p class="lp-attention">The opening price is outside your range. This position starts with one asset and cannot support this example trade.</p>':''}`:
      `<div class="lp-summary-metrics">${stat('Raise range',`${show(m.soft)}–${show(m.hard)} <em>ETH</em>`)}${stat('Contribution window',`${m.hours} <em>hours</em>`)}${stat('Community allocation',`${show(m.publicTokens)} <em>${symbol(d)}</em>`,'Closing price depends on total contributions.')}</div>`}`;
    }catch(e){return `<div class="lp-summary-head"><span>THE COMPOSITION</span></div><div class="lp-await"><span>✧</span><h4>One ingredient needs attention.</h4><p>${esc(e.message)}</p><small>Your other settings are preserved.</small></div>`;}
  }
  rangeDetail(){try{const m=marketModel(this.d);return `<p class="lp-note">Usable price range: <b>${fmt(m.lowerPrice)}–${fmt(m.upperPrice)} ${quote(this.d)}</b>. ${m.active?'Opening price is inside.':'Opening price is outside.'}</p>`;}catch(e){return `<p class="lp-error">${esc(e.message)}</p>`;}}
  scenario(){const d=this.d;
    try{
      if(d.mode==='sale'){
        const m=saleModel(d),a=saleAllocation(d,m);
        return `<div class="lp-result-title">${m.successful?'The raise succeeds.':'The raise is refunded.'}</div><div class="lp-results">${stat(m.successful?'Your allocation':'Your refund',m.successful?`${show(a.tokens)} <em>${symbol(d)}</em>`:`${show(a.refund)} <em>ETH</em>`)}${stat('ETH to liquidity',`${show(m.liquidity)} <em>ETH</em>`)}${stat('ETH to locked treasury',`${show(m.treasury)} <em>ETH</em>`)}${stat('Price per token',m.successful?`${fmt(m.price)} <em>ETH</em>`:'No tokens sold')}</div>${m.successful?`<p class="lp-note">${fmt(number(a.contribution)/number(m.raised)*100,3)}% of contributions receives the same share of community tokens. Rounding occurs in raw token units.</p>`:''}`;
      }
      const m=marketModel(d),t=poolTrade(m,d.direction,d.tradeAmount),out=d.direction==='buy'?symbol(d):quote(d),input=d.direction==='buy'?quote(d):symbol(d);
      return `<div class="lp-results">${stat('You receive',`${show(t.out,d.direction==='buy'?18:m.qd)} <em>${out}</em>`)}${stat('Average price paid',`${fmt(t.average)} <em>${quote(d)}</em>`)}${stat('Price impact incl. both fees',`${fmt(t.impact,3)}%`)}${stat('LP fee on pool input',`${show(t.fee,d.direction==='buy'?m.qd:18)} <em>${input}</em>`)}${stat('Creator hook fee',`${show(t.hookFee,d.direction==='buy'?m.qd:18)} <em>${input}</em>`)}${stat('Net input moving the price',`${show(t.net,d.direction==='buy'?m.qd:18)} <em>${input}</em>`)}</div>${this.curve(m,t)}${row('Spot price after this trade',`${fmt(t.after)} ${quote(d)}`)}`;
    }catch(e){return `<div class="lp-scenario-error"><b>Adjust this scenario</b><p>${esc(e.message)}</p></div>`;}
  }
  curve(m,t){
    const d=this.d,points=[{x:0,price:m.price}],amount=Number(d.tradeAmount);
    for(let i=1;i<=24;i++){
      try{const result=poolTrade(m,d.direction,(amount*i/24).toFixed(Math.min(d.direction==='buy'?m.qd:18,18)));points.push({x:i/24,price:result.after});}catch{}
    }
    const min=Math.min(m.price,t.after),max=Math.max(m.price,t.after),span=max-min||m.price*.01;
    const coords=points.map(p=>`${(14+p.x*372).toFixed(2)},${(105-(p.price-min)/span*70).toFixed(2)}`);
    const line='M'+coords.join(' L'),area=line+` L386,123 L14,123 Z`;
    return `<div class="lp-curve"><div><span>OPENING PRICE</span><span>AFTER YOUR ${d.direction.toUpperCase()}</span></div><svg viewBox="0 0 400 138" role="img" aria-label="Price moves from ${fmt(m.price)} to ${fmt(t.after)} ${quote(d)} per token during the example trade"><defs><linearGradient id="lp-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#86edde" stop-opacity=".22"/><stop offset="1" stop-color="#86edde" stop-opacity="0"/></linearGradient></defs><path d="M14 123H386 M14 78H386 M14 33H386" fill="none" stroke="#d8edff14" stroke-dasharray="3 5"/><path d="${area}" fill="url(#lp-chart-fill)"/><path d="${line}" fill="none" stroke="#8df0e4" stroke-width="2.5"/><circle cx="${14+372}" cy="${105-(t.after-min)/span*70}" r="4" fill="#dcfff9"/></svg><div><strong>${fmt(m.price)}</strong><strong>${fmt(t.after)} ${quote(d)}</strong></div></div>`;
  }
  comparison(){if(!this.baseline)return '';try{const m=marketModel(this.d),b=this.baseline;return `<div class="lp-comparison"><h4>Your comparison</h4><table><thead><tr><th scope="col">Measure</th><th scope="col">Kept</th><th scope="col">Current</th></tr></thead><tbody>${[['Quote asset',esc(b.quote),quote(this.d)],['Opening price',fmt(b.price),fmt(m.price)],['Funded quote',fmt(b.funded),show(m.usedQuote,m.qd)],['Token liquidity',fmt(b.tokens),show(m.usedToken)],['LP fee',fmt(b.fee/10000)+'%',fmt(m.fee/10000)+'%']].map(r=>`<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>`;}catch{return '';}}
  replayEditor(){const sale=this.d.mode==='sale',key=sale?'saleSequence':'eventSequence';return `<section class="lp-replay-editor"><h4>Replay the whole sequence</h4><p class="lp-note">Each accepted event starts from the preceding balances. A rejected event changes nothing and stops the sequence. Edit the participants, amounts and order.</p>
      ${sale?'':`${this.choice('scenarioTokenOrder',[['token0','New token sorts first'],['token1','Paired token sorts first']])}<p class="lp-note">This selects the scenario’s address-order assumption. The signing review always resolves actual addresses and decimals from chain.</p><details><summary>Optional retained-token vesting stress</summary><div class="lp-fields">${this.field('retainedLockAmount','Retained tokens assumed locked',{help:'Zero means no lock. This is a scenario assumption; depositing into a real vault is a separate reviewed transaction.'})}${this.field('retainedCliffDays','Cliff · days',{type:'number',min:0,max:3650})}${this.field('retainedVestingDays','Linear vesting · days',{type:'number',min:1,max:3650})}</div><p class="lp-note">Use “advance 180”, then “unlock”, then an explicit “sell creator 1000” to test selling released tokens. Time and unlocking do not automatically sell anything.</p></details><details><summary>Build a sequence from quote volume</summary>${this.field('volume',`Total buy input · ${quote(this.d)}`)}${button('replay-volume','Split volume into ten buys')}<p class="lp-note">Explicitly funds one participant, then applies each buy in order. The path may reach the funded range boundary.</p></details>`}
      <div class="lp-field"><label for="lp-${key}">Event sequence</label><textarea id="lp-${key}" data-lp-field="${key}" rows="9" maxlength="12000" spellcheck="false" aria-describedby="lp-event-help">${esc(this.d[key])}</textarea><small id="lp-event-help">${sale?'Commands: contribute alice 2 · withdraw alice 1 · close · settle · claim alice · advance 180 · release. Contributions are explicit external funding.':'Commands: fund alice 1 · buy alice 0.1 · sell alice 100 · flush · claim 1 · weights 3 1 · advance 180 · unlock. Buys spend quote; sells spend launch tokens. Recipient numbers match the configured split.'}</small></div><div id="lp-replay">${this.replayView()}</div>${button('replay-export','Download exact replay')}</section>`;}
  replayView(){try{const sale=this.d.mode==='sale',r=sale?replaySale(this.d):replayPool(this.d),s=r.state,asset=(n,type)=>`${show(n,type==='quote'?(sale?18:s.model.qd):18)} ${type==='quote'?(sale?'ETH':quote(this.d)):symbol(this.d)}`;
      const rows=r.history.map(e=>`<tr><td>${e.line}</td><td><code>${esc(e.text)}</code><small>${esc(e.error||e.description)}</small></td><td>${e.status==='rejected'?'Stopped':e.kind==='buy'||e.kind==='sell'?`${asset(e.out,e.output)} received<br><small>Hook ${asset(e.hookFee,e.input)} · LP ${asset(e.lpFee,e.input)}</small>`:e.kind==='claim'&&sale?`${asset(e.amount,e.refund?'quote':'token')}`:e.kind==='unlock'?asset(e.amount,'token'):e.kind==='settle'?esc(e.outcome):'Applied'}</td></tr>`).join('');
      const accounts=Object.entries(s.accounts).map(([name,a])=>`<tr><th scope="row">${esc(name)}</th><td>${asset(a.token,'token')}</td><td>${asset(a.quote,'quote')}</td></tr>`).join('');
      return `<p class="lp-note">${esc(r.scope)}</p><div class="lp-replay-status ${r.complete?'':'lp-attention'}">${r.complete?'All events applied.':'Sequence stopped at the rejected event.'} Both asset ledgers balance exactly.</div><div class="lp-comparison lp-replay-table"><table><thead><tr><th>Line</th><th>Event and effect</th><th>Result</th></tr></thead><tbody>${rows||'<tr><td colspan="3">Enter an event to begin.</td></tr>'}</tbody></table></div>
      ${sale?`${row('Sale state',esc(s.status))}${row('Outstanding token inventory / claims',asset(s.saleTokens,'token'))}${row('Contribution / refund escrow',asset(s.escrow,'quote'))}${row('Permanent market liquidity',`${asset(s.lpToken,'token')} + ${asset(s.lpQuote,'quote')}`)}${row('Still locked',`${asset(s.founderLocked,'token')} + ${asset(s.treasuryLocked,'quote')}`)}<p class="lp-note">Rounding dust stays in the sale contract. It is not reassigned to the last claimant. Failed sales retain the token inventory and refund contributed ETH.</p>`:`${row('Price after accepted events',`${fmt(s.model.price)} ${quote(this.d)}`)}${row('Position inventory, excluding LP fees',`${asset(s.reserves.token,'token')} + ${asset(s.reserves.quote,'quote')}`)}${row('LP fees charged',`${asset(s.lpFees.token,'token')} + ${asset(s.lpFees.quote,'quote')}`)}${row('Creator fees awaiting flush',`${asset(s.hookPending.token,'token')} + ${asset(s.hookPending.quote,'quote')}`)}${row('Retained tokens still locked',asset(s.lock.remaining,'token'))}<p class="lp-note">LP fees remain separate from liquidity principal and are not compounded. v4 fee-growth rounding can leave unclaimable raw-unit dust. Exact principal and fees are established by the live position read.</p>`}
      <details><summary>Every participant’s final balance</summary><div class="lp-comparison"><table><thead><tr><th>Participant</th><th>${symbol(this.d)}</th><th>${sale?'ETH':quote(this.d)}</th></tr></thead><tbody>${accounts}</tbody></table></div></details><details><summary>Exact raw-unit conservation</summary>${row('Token supply accounted for',String(r.conservation.token))}${row('Total quote funding accounted for',String(r.conservation.quote))}<p class="lp-note">Every transfer is debited from one balance and credited to another. Explicit funding introduces quote assets; no trade creates tokens or quote currency.</p></details>`;
    }catch(e){return `<div class="lp-scenario-error"><b>Adjust the event sequence</b><p>${esc(e.message)}</p></div>`;}}
  flows(){try{const r=replayPool(this.d),s=r.state;return `<div class="lp-flow"><div class="lp-flow-source"><span>Creator fees from accepted replay trades</span><b>${show(s.feeTotal.quote,s.model.qd)} ${quote(this.d)} + ${show(s.feeTotal.token)} ${symbol(this.d)}</b><small>Weights apply at each explicit flush. Existing deposited claims keep their beneficiary.</small></div>${s.recipients.map(recipient=>{const held=s.accounts[recipient.account]||{token:0n,quote:0n},claim=s.claims[recipient.account]||{token:0n,quote:0n};return `<div class="lp-flow-row"><div><span>${esc(recipient.label)}</span><strong>Weight ${recipient.weight}</strong></div><p class="lp-note">Claimable: ${show(claim.quote,s.model.qd)} ${quote(this.d)} + ${show(claim.token)} ${symbol(this.d)}<br>Received: ${show(held.quote,s.model.qd)} ${quote(this.d)} + ${show(held.token)} ${symbol(this.d)}</p></div>`;}).join('')}</div>`;}catch(e){return `<p class="lp-error">${esc(e.message)}</p>`;}}
  fileDialog(){const restore=this.dialog==='restore';return `<section class="lp-file-dialog" role="region" aria-label="${restore?'Restore':'Save'} encrypted draft"><div><h4>${restore?'Open your sealed draft.':'Seal your work.'}</h4>${button('dismiss','×')}</div><p>${restore?'Choose an encrypted Anima launch draft and enter its password.':'Download an encrypted copy. Its contents stay unreadable without your password; there is no password recovery.'}</p>${restore?`<label for="lp-backup-file">Encrypted draft file</label><input id="lp-backup-file" type="file" accept=".json,application/json">`:''}<label for="lp-password">Password · at least 16 characters</label><input id="lp-password" type="password" autocomplete="${restore?'current-password':'new-password'}" minlength="16">${!restore?'<label for="lp-password-confirm">Confirm password</label><input id="lp-password-confirm" type="password" autocomplete="new-password" minlength="16">':''}<div class="lp-actions">${button(restore?'decrypt':'encrypt',restore?'Decrypt & restore':'Encrypt & download','lp-primary')}${button('dismiss','Cancel')}</div><p id="lp-file-message" class="lp-message" role="status" aria-live="polite"></p></section>`;}
  mount(root){
    this.root=root;this.abort?.abort();this.abort=new AbortController();const signal=this.abort.signal;
    root.addEventListener('input',e=>this.input(e),{signal});
    root.addEventListener('change',e=>{if(e.target.id==='lp-backup-file')this.file=e.target.files?.[0]||null;},{signal});
    root.addEventListener('click',e=>{
      const b=e.target.closest('[data-lp-action],[data-lp-choice],[data-lp-step]');if(!b||b.disabled)return;
      Promise.resolve().then(()=>this.click(b)).catch(err=>this.message(err.message));
    },{signal});
    // Prevent Enter in a text input from submitting the surrounding instrument dialog.
    root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-lp-field]')&&e.target.tagName!=='TEXTAREA')e.preventDefault();},{signal});
  }
  redraw(focus){if(!this.root)return;const root=this.root;root.innerHTML=this.html();this.mount(root);if(focus)root.querySelector(focus)?.focus();}
  input(e){
    const el=e.target,key=el.dataset.lpField,r=el.dataset.lpRecipient;
    if(key){if(!(key in defaults())||key==='recipients')return;this.d[key]=el.type==='checkbox'?el.checked:el.value;this.saved=false;if(key==='hookEnabled'){this.changed();this.redraw('[data-lp-field="hookEnabled"]');return;}}
    else if(r){const [i,k]=r.split(':');if(!this.d.recipients[i]||!['label','recipient','weight'].includes(k))return;this.d.recipients[i][k]=el.value;this.saved=false;}
    else return;
    this.changed();this.derived();if(key==='quoteSymbol'||key==='symbol')this.relabel();this.message('');
  }
  relabel(){const d=this.d;for(const [key,label] of [['price',`Opening price · ${d.quoteSymbol} per token`],['quoteBudget',`Maximum ${d.quoteSymbol} to fund`],['tokenBudget',`Maximum ${d.symbol} for liquidity`],['lowerPrice',`Lower price · ${d.quoteSymbol}`],['upperPrice',`Upper price · ${d.quoteSymbol}`]]){const el=this.root?.querySelector(`label[for="lp-${key}"]`);if(el)el.textContent=label;}}
  derived(){for(const [id,html] of [['lp-composition',()=>this.composition()],['lp-range-detail',()=>this.rangeDetail()],['lp-scenario',()=>this.scenario()],['lp-comparison',()=>this.comparison()],['lp-fee-flow',()=>this.flows()],['lp-replay',()=>this.replayView()]]){const el=this.root?.querySelector('#'+id);if(el)el.innerHTML=html();}}
  message(msg){const el=this.root?.querySelector(this.dialog?'#lp-file-message':'#lp-message');if(el)el.textContent=msg;}
  validateStep(step){validateIdentity(this.d);if(step>=1){if(this.d.mode==='pool')marketModel(this.d);else saleTerms(this.d);}if(step>=2&&this.d.mode==='pool'&&this.d.hookEnabled)feeFlow({...this.d,volume:'0'},{validateAddresses:true});}
  async click(b){
    if(this.busy)return;
    if(b.dataset.lpChoice){const [k,v]=b.dataset.lpChoice.split(':');const permitted={mode:['pool','sale'],range:['full','custom'],direction:['buy','sell'],funding:['private','public'],scenarioTokenOrder:['token0','token1']};if(!permitted[k]?.includes(v))return;this.d[k]=v;if(k==='direction')this.d.tradeAmount=v==='buy'?'0.1':'100';this.changed();this.redraw(`[data-lp-choice="${k}:${v}"]`);return;}
    if(b.dataset.lpStep!==undefined){const step=Number(b.dataset.lpStep);if(!Number.isInteger(step)||step<0||step>3)return;if(step>this.step)this.validateStep(step-1);this.step=step;this.redraw(`[data-lp-step="${step}"]`);return;}
    const act=b.dataset.lpAction;
    if(act.startsWith('asset:')){const asset=act.split(':')[1];if(!['WETH','USDC'].includes(asset))return;this.d.quoteSymbol=asset;this.d.quoteToken='';this.d.quoteDecimals=asset==='USDC'?'6':'18';this.changed();this.redraw();this.message(`Amounts now use ${asset}. Review price and funding; no currency conversion was performed.`);return;}
    if(act==='next'){this.validateStep(this.step);this.step=Math.min(3,this.step+1);this.redraw(`[data-lp-step="${this.step}"]`);return;}
    if(act==='back'){this.step=Math.max(0,this.step-1);this.redraw(`[data-lp-step="${this.step}"]`);return;}
    if(act==='save'||act==='restore'){this.dialog=act;this.file=null;this.redraw('#lp-password');return;}
    if(act==='dismiss'){this.dialog=null;this.file=null;this.redraw('[data-lp-action="save"]');return;}
    if(act==='encrypt'||act==='decrypt')return this.crypt(act);
    if(act==='baseline'){const m=marketModel(this.d);this.baseline={price:m.price,quote:this.d.quoteSymbol,funded:number(m.usedQuote,m.qd),tokens:number(m.usedToken),fee:m.fee};this.redraw('[data-lp-action="baseline"]');return;}
    if(act==='add'){if(this.d.recipients.length>=64)return;this.d.recipients.push({label:'',recipient:'',weight:'1',outputToken:'0x'+'0'.repeat(40)});this.changed();this.redraw('#lp-label-'+(this.d.recipients.length-1));return;}
    if(act.startsWith('remove:')){const i=Number(act.split(':')[1]);if(this.d.recipients.length>1&&Number.isInteger(i)&&i>=0&&i<this.d.recipients.length)this.d.recipients.splice(i,1);this.changed();this.redraw();return;}
    if(act==='replay-export'){this.download(scenarioJSON(this.d.mode==='sale'?replaySale(this.d):replayPool(this.d)),'anima-launch-event-replay.json');return;}
    if(act==='replay-volume'){const total=units(this.d.volume,Number(this.d.quoteDecimals)),count=total<10n?Number(total):10;let used=0n;const events=[`fund alice ${decimal(total,Number(this.d.quoteDecimals))}`];for(let i=0;i<count;i++){const amount=i===count-1?total-used:total/BigInt(count);used+=amount;events.push(`buy alice ${decimal(amount,Number(this.d.quoteDecimals))}`);}if(this.d.hookEnabled)events.push('flush','claim 1');this.d.eventSequence=events.join('\n');this.changed();this.redraw();return;}
    if(act==='export'){const plan=exportPlan(this.d);if(this.d.mode==='pool'&&this.d.quoteToken&&!/^0x[\da-f]{40}$/i.test(this.d.quoteToken))throw Error('Enter a valid paired-token address or leave it blank for later verification.');this.download(plan,'anima-launch-plan.json');this.saved=true;this.message('Launch plan exported. No transaction was sent.');return;}
    if(act==='launch'){
      this.validateStep(3);
      if(typeof this.context?.prepareLaunch!=='function')throw Error('Open this composer from the launch desk to prepare an onchain launch.');
      this.busy=true;b.disabled=true;
      try{return await this.context.prepareLaunch(structuredClone(this.d));}
      finally{this.busy=false;b.disabled=false;}
    }
  }
  async crypt(act){
    const password=this.root?.querySelector('#lp-password');if(!password)return;
    const value=password.value;const confirmation=this.root.querySelector('#lp-password-confirm');if(act==='encrypt'&&value!==confirmation?.value)throw Error('The passwords do not match.');password.value='';if(confirmation)confirmation.value='';this.busy=true;const generation=this.generation;
    try{
      this.message(act==='encrypt'?'Encrypting your draft…':'Opening your draft…');
      if(act==='encrypt'){
        const snapshot=structuredClone(this.d);const {envelope}=await sealPrivateData({schema:'anima.launch-draft/1',draft:snapshot},value);
        if(generation!==this.generation||!this.root)return;
        this.download(envelope,'anima-launch-draft.encrypted.json');this.saved=true;this.message('Encrypted draft downloaded. Keep its password separately.');
      }else{
        if(!this.file||this.file.size>2000000)throw Error('Choose an encrypted Anima draft under 2 MB.');
        const {data}=await openSealedData(JSON.parse(await this.file.text()),value);
        if(generation!==this.generation||!this.root)return;
        if(data.schema!=='anima.launch-draft/1')throw Error('This encrypted file is not a launch draft.');
        this.d=hydrateDraft(data.draft);this.configure(this.context||{});this.changed();this.step=0;this.baseline=null;this.dialog=null;this.file=null;this.saved=true;this.redraw();this.message('Draft restored. Review its settings before using it.');
      }
    }finally{this.busy=false;}
  }
  download(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
}
export const launchStudio=new LaunchStudio();
