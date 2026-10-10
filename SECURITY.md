# Security and private data

Report a suspected vulnerability privately to **can.yazicioglu.p@gmail.com**. Describe the affected version and a reproduction using sample data. Do not include account passwords, API secrets, recovery phrases, personal balances or complete vault backups in an issue or email.

## Boundaries

- Windows persistence uses Electron `safeStorage`; app access is gated by the in-app lock. Operating-system account security still matters.
- Web access requires a valid Cloudflare Access token and an invited email. Each identity receives its own vault.
- Web records and connection credentials are encrypted in the browser with AES-256-GCM. Password derivation uses PBKDF2-SHA-256 with 600,000 iterations. The vault password is not sent to the server.
- During an account sync, the server relay temporarily receives read-only credentials over HTTPS to call the provider. Encryption at rest does not remove trust in that relay or the browser serving the code.
- The application does not intentionally log or persist plaintext provider secrets. Deployment logging and error reporting must preserve that property.
- Some providers allow key-permission validation; others do not. Use a dedicated read-only key and leave trading, withdrawals and transfer permissions disabled.
- Disconnecting removes credentials from the current vault; previous encrypted backups may still contain them. Revoke a key at its provider when appropriate.
- Manual portfolio JSON and CSV exports are unencrypted. Full web vault backups are encrypted and retain the password used when exported.

## Research sessions

Opening Research from an unlocked browser uses an exact-origin, exact-window, one-use handshake with a 15-second expiry. The child verifies account identity and vault salt before using a non-extractable CryptoKey transferred through MessageChannel. Passwords and raw key bytes are never persisted for this handoff. Explicit lock and successful password rotation send an account-scoped lock signal to other tabs. Reloading or directly opening a tab still requires unlock.

Research provider credentials use the same encrypted storage and HTTPS relay boundaries as existing data providers. They are not embedded in widgets, logs or client bundles. Private notebook inputs are not automatically transmitted to an LLM.

## Repository hygiene

This source distribution excludes live account records, API credentials, local profiles, encrypted backups, Cloudflare invitation configuration and Store package identity. `.gitignore` reduces accidental inclusion but is not a substitute for reviewing staged changes.

Tests use synthetic identities and provider fixtures. The loopback test server intentionally bypasses production identity checks and stores temporary vaults in memory. Never expose it to the internet or use it with real financial credentials.

There is no claim of an independent security audit, regulated payment service, guaranteed provider availability or tax reporting accuracy. Security tests verify specific behaviours; they cannot prove the absence of vulnerabilities.
