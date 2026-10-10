# Email password reset

This is a **fresh start**, not recovery of forgotten encryption keys. The existing web password derives a non-extractable AES-GCM key locally. Neither the password nor a decrypting recovery key is stored by HardEarner. Email cannot decrypt an existing vault. This remains true after this update.

## User flow

1. Sign into the private website with the invited email. On the vault lock screen select **Forgot your password / Şifremi unuttum**.
2. Read and acknowledge the empty-vault warning. If another device remains unlocked, keep it open and export records first.
3. Request a code sent only to the verified account address. Enter the eight-digit code and confirm a new password (12–256 characters).
4. The previous ciphertext is archived atomically with saving a new empty vault. Sign in normally with the new password; reset does not automatically unlock it.
5. Settings → Private cloud vault → Encrypted archives from password resets downloads the previous vault. Remembering the old password allows preview and restoration with the existing backup tools. Reset does not remove the private invitation, affect other users, cancel exchange API keys or change the installed Windows password.

## Deployment

Uses Cloudflare Email Service, already hosting the private Worker. No new third-party mail provider or key-escrow service is added.

- Onboard the owned sending domain under Email Routing; preserve any existing mail DNS. No catch-all forwarding is needed.
- On the Workers Free plan, add each invited email under Destination addresses and have that person verify the Cloudflare email once. These sends are free; arbitrary recipients require a paid plan. Do not purchase a plan implicitly. Future invitations need recipient verification as well as the existing Access and Worker allowlists.
- Add `send_email: [{"name":"RECOVERY_EMAIL"}]` to the ignored deployment configuration. It sends only to verified destinations. The application always chooses the recipient from the verified Access JWT; request bodies cannot select an email address.
- Set `RECOVERY_FROM` to a mailbox on the onboarded domain, such as `security@your-domain.example`.
- Generate 32 random bytes and set their hex representation using `wrangler secret put RECOVERY_SECRET`. Never put it in a tracked file, client bundle, URL or logs. Rotation invalidates outstanding codes; it cannot decrypt any vault.
- No secret or binding means reset stays unavailable. Sending failures leave the vault untouched and return a safe message, without provider internals or false delivery confirmation.

## Protocol and retention

All routes require the existing verified issuer/audience/email allowlist. Mutations require same origin. Requests and email addresses are not logged by the feature. Passwords stay in the browser. Codes exist transiently for sending; only an HMAC tied to the account, challenge and purpose is stored.

Codes expire after 10 minutes, permit 5 attempts, and are superseded on resend. Persistent account limits are one request per minute, five per hour and ten per day. Provider failures count toward send limits. The revision is bound to the challenge so another device's newer changes cancel reset. Different data cannot reuse a consumed code; an exact committed request can be retried after a lost response.

SQLite commits the used-code record, an immutable copy of the previous ciphertext and the replacement as one transaction. Reset archives are not pruned by normal three-revision retention. Up to 20 reset archives are supported before support is required; no archive is silently deleted. The browser also retains pre-reset ciphertext and any pending encrypted save. An old password is still required to open any old copy. User-requested account deletion must include these archives and reset metadata.

Other open tabs lock through the existing account-scoped in-memory channel. Other devices detect the new salt; stale revision writes are rejected. Research session sharing remains non-extractable and cannot open a vault encrypted with the new salt.

## Verification

Run `npm test` and `node scripts/web-ui.cjs recovery-browser.cjs`. The isolated loopback harness captures synthetic emails; it is never deployed. Tests cover recipient binding, wrong/expired/used codes, five-attempt limits across restarts, resend budgets, provider failures, missing configuration, stale revision, transactional rollback, preserved archives, exact retries, new-password login, account isolation, Chrome/WebKit and phone layout. These tests do not send real email or reset production users.

## References checked 10 October 2026

- [Cloudflare email pricing and verified recipients](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Email Worker binding and API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Sending restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
- [OWASP forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
