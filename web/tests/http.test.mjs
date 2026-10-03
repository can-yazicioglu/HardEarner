import {test} from 'node:test';import assert from 'node:assert/strict';
import {boundedJson,requireSameOrigin} from '../server/http.mjs';
import {authenticate} from '../server/access.mjs';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
test('state-changing requests reject cross-site or missing origins',()=>{
 for(const origin of [null,'https://evil.example'])assert.throws(()=>requireSameOrigin(new Request('https://private.hardearner.com/api/vault',{method:'PUT',headers:origin?{Origin:origin}:{}})));
 assert.doesNotThrow(()=>requireSameOrigin(new Request('https://private.hardearner.com/api/vault',{method:'PUT',headers:{Origin:'https://private.hardearner.com'}})));
});
test('body size is bounded without relying on Content-Length',async()=>{
 const make=body=>new Request('https://private.hardearner.com/api/vault',{method:'PUT',headers:{'Content-Type':'application/json'},body});
 await assert.rejects(boundedJson(make('x'.repeat(101)),100),e=>e.status===413);
 await assert.rejects(boundedJson(make('{oops'),100),e=>e.status===400);
 assert.deepEqual(await boundedJson(make('{"ok":true}'),100),{ok:true});
});
test('private app fails closed without Access configuration and rejects forged headers',async()=>{
 const request=new Request('https://private.hardearner.com/',{headers:{'Cf-Access-Authenticated-User-Email':'owner@test.invalid'}});
 await assert.rejects(authenticate(request,{}),e=>e.status===503);
 await assert.rejects(authenticate(request,{ACCESS_ISSUER:'https://example.cloudflareaccess.com',ACCESS_AUD:'a'.repeat(64),ALLOWED_EMAILS:'owner@test.invalid'}),e=>e.status===401);
});
test('signed Access identity is checked for audience, expiry and invitations',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey),issuer='https://verified-test.cloudflareaccess.com',aud='d'.repeat(64),env={ACCESS_ISSUER:issuer,ACCESS_AUD:aud,ALLOWED_EMAILS:'owner@test.invalid,friend@test.invalid'},originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>{assert.equal(String(url),issuer+'/cdn-cgi/access/certs');return Response.json({keys:[{...jwk,kid:'synthetic',alg:'RS256',use:'sig'}]});};
 const token=(email,customAud=aud,expiry='1h')=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'synthetic'}).setSubject('synthetic-subject').setIssuer(issuer).setAudience(customAud).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
 const request=t=>new Request('https://private.hardearner.com/',{headers:{'cf-access-jwt-assertion':t,'cf-access-authenticated-user-email':'forged@test.invalid'}});
 try{const valid=await token('owner@test.invalid'),identity=await authenticate(request(valid),env);assert.equal(identity.email,'owner@test.invalid');assert.match(identity.id,/^[a-f0-9]{64}$/);
  const friend=await authenticate(request(await token('FRIEND@test.invalid')),env);assert.equal(friend.email,'friend@test.invalid');assert.notEqual(friend.id,identity.id);assert.equal((await authenticate(request(await token('friend@test.invalid')),env)).id,friend.id);
  await assert.rejects(authenticate(request(await token('uninvited@test.invalid')),env),e=>e.status===403);
  await assert.rejects(authenticate(request(await token('owner@test.invalid','wrong-audience')),env),e=>e.status===401);
  await assert.rejects(authenticate(request(await token('owner@test.invalid',aud,'-1h')),env),e=>e.status===401);
  const parts=valid.split('.');parts[1]=Buffer.from(JSON.stringify({email:'owner@test.invalid'})).toString('base64url');await assert.rejects(authenticate(request(parts.join('.')),env),e=>e.status===401);
 }finally{globalThis.fetch=originalFetch;}
});
