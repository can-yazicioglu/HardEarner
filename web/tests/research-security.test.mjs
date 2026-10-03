import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetHeaders} from '../server/security-headers.mjs';
test('Research embeds never loosen the vault origin script policy or allow framing the vault',()=>{
 for(const path of ['/','/index.html','/research-widget.html']){const headers=assetHeaders(new Headers(),path),csp=headers.get('Content-Security-Policy');assert.match(csp,/script-src 'self';/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/frame-src https:\/\/www.tradingview-widget.com;/);assert(!csp.includes('unsafe-eval'));assert.equal(headers.get('Referrer-Policy'),'no-referrer');}
});
