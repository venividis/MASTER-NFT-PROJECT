import test from 'node:test';
import assert from 'node:assert/strict';
import {trackedBalanceText} from '../../web/extensions/security.mjs';
test('hostile token metadata cannot prevent reporting readable or unresolved balances',()=>{
  assert.equal(trackedBalanceText(123n,255),'123 base units');
  assert.equal(trackedBalanceText(0n,null),'0 base units');
  assert.equal(trackedBalanceText(0n,255,false),'Unknown');
  assert.equal(trackedBalanceText(123n,2),'1.23');
});
