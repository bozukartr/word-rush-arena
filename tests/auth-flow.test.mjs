import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, recoverGoogleLogin } from '../auth-flow.js';

const options = (overrides = {}) => ({
  credentialFromError: () => ({ token: 'test-only' }),
  confirmSwitch: async () => true,
  signInExisting: async () => {},
  canRedirect: false,
  redirect: async () => {},
  ...overrides
});

test('existing Google account signs in using the returned credential after consent', async () => {
  let received;
  await recoverGoogleLogin({ code: 'auth/credential-already-in-use' }, options({ signInExisting: async c => { received = c; } }));
  assert.deepEqual(received, { token: 'test-only' });
});
test('declining account switch preserves guest session', async () => {
  await recoverGoogleLogin({ code: 'auth/credential-already-in-use' }, options({
    confirmSwitch: async () => false,
    signInExisting: async () => assert.fail('must not change account')
  }));
});
test('missing credential is a recoverable UI error', async () => {
  const error = { code: 'auth/credential-already-in-use' };
  await assert.rejects(recoverGoogleLogin(error, options({ credentialFromError: () => null })), e => e === error);
});
test('blocked cross-origin popup does not start a storage-broken redirect', async () => {
  const error = { code: 'auth/popup-blocked' };
  await assert.rejects(recoverGoogleLogin(error, options({ redirect: async () => assert.fail('cross-origin redirect') })), e => e === error);
});
test('same-origin popup fallback redirects once', async () => {
  let redirects = 0;
  await recoverGoogleLogin({ code: 'auth/popup-blocked' }, options({ canRedirect: true, redirect: async () => { redirects++; } }));
  assert.equal(redirects, 1);
});
test('redirect failure propagates to the outer login error handler', async () => {
  const error = { code: 'auth/unauthorized-domain' };
  await assert.rejects(recoverGoogleLogin({ code: 'auth/popup-blocked' }, options({ canRedirect: true, redirect: async () => { throw error; } })), e => e === error);
});
test('closing or cancelling popup does not redirect or show an error', async () => {
  for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
    await recoverGoogleLogin({ code }, options({ redirect: async () => assert.fail('redirect after cancel') }));
  }
});
test('configuration and network failures have distinct actionable messages', () => {
  assert.match(authErrorMessage({ code: 'auth/unauthorized-domain' }), /alan adı/);
  assert.match(authErrorMessage({ code: 'auth/operation-not-allowed' }), /etkinleştirilmeli/);
  assert.match(authErrorMessage({ code: 'auth/network-request-failed' }), /İnternet/);
});
