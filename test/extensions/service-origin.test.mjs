import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceOrigin } from '../../web/extensions/service-origin.mjs';
import { requestAgentHost } from '../../web/extensions/agents.mjs';

test('Bearer host rejects remote plaintext, lookalike loopback, credential URLs and cross-origin routes before fetch', async () => {
  let calls = 0;
  const fetcher = async () => { ++calls; throw Error('Credential reached transport'); };
  const invalid = ['http://remote.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example', 'http://10.0.0.2', 'https://token@host.example', 'https://host.example/path', 'https://host.example?token=secret', 'https://host.example#secret', 'file:///tmp/host'];
  for (const hostUrl of invalid) {
    await assert.rejects(requestAgentHost({hostUrl, hostToken: 'a'.repeat(40), route: '/status', fetcher}), /HTTPS origin/);
  }
  await assert.rejects(requestAgentHost({hostUrl:'https://host.example',hostToken:'a'.repeat(40),route:'https://other.example/status',fetcher}), /selected host/);
  assert.equal(calls, 0);
});

test('HTTPS and exact loopback preserve bearer review controls, no credentials or redirects', async () => {
  for (const origin of ['https://agent.example', 'http://127.0.0.1:8793', 'http://localhost:8793', 'http://[::1]:8793']) {
    assert.equal(serviceOrigin(origin), origin);
    const result = await requestAgentHost({hostUrl:origin,hostToken:'a'.repeat(40),route:'/purchase/review',body:{service:2},fetcher:async(url, options)=>{
      assert.equal(url.origin, origin); assert.equal(url.pathname,'/purchase/review');
      assert.equal(options.credentials,'omit'); assert.equal(options.referrerPolicy,'no-referrer'); assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(40)); assert.deepEqual(JSON.parse(options.body),{service:2});
      return {ok:true,json:async()=>({reviewId:'one-use'})};
    }});
    assert.equal(result.reviewId, 'one-use');
  }
});
