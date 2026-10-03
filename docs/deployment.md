# Private deployment and Windows distribution

This repository is a source snapshot. Its example configuration cannot access the existing HardEarner deployment, invite list, cloud vaults or Microsoft package identity. CI builds and tests only; it never deploys or publishes.

## Cloudflare private web

1. Build both targets from the repository root with `npm run build`.
2. Copy `web/wrangler.example.jsonc` to ignored `web/wrangler.local.jsonc`.
3. Configure the intended Cloudflare account and private custom domain. Create a Cloudflare Access application covering the entire domain and its paths, with an explicit invited-email policy.
4. Set `ACCESS_ISSUER`, that Access application's `ACCESS_AUD`, and the matching `ALLOWED_EMAILS` in the local config. The Worker rejects missing/invalid configuration and validates signed identity itself.
5. Keep `workers_dev` and `preview_urls` disabled, and `assets.run_worker_first` enabled. Add the intended custom-domain route to your local config. Keep deployment identities and invitation lists out of Git.
6. Authenticate Wrangler for your account, review the target, then deploy explicitly:

```sh
cd web
npx wrangler deploy --config wrangler.local.jsonc
```

The `VAULTS` binding uses the exported `UserVault` SQLite Durable Object. The example's migration creates a new namespace on a new deployment. For an existing installation, retain its real Worker name, namespace and migration history; do not replace them with an example. Back up encrypted vaults before a migration.

After deployment, verify that an unauthenticated visit cannot obtain the app or API data, a non-invited identity is rejected, and two invited test users cannot read each other's vault. Check unlock, encrypted save/reload, a supported read-only test connection and mobile navigation. Do not use the synthetic local test server as an internet service.

Web browser sync is implemented; synchronization into the installed Windows app is not. Closing or suspending the browser stops web alert checks.

## Windows packages

Development runs do not require a Store submission. Distributing a trusted Windows package is a separate process.

```sh
npm --prefix desktop run build
npm --prefix desktop run package
```

The packager writes to `.artifacts/packages/HardEarner-<version>/`. The output is not automatically signed, installed or uploaded. Follow the PC's normal signing policy; do not disable Windows protection to test a package.

For the Store MSIX build, on Windows:

1. Copy `desktop/store/identity.example.json` to ignored `desktop/store/identity.json` and use the exact identity from your Partner Center product.
2. Install the Windows SDK and point `HARDEARNER_WINDOWS_SDK_BIN` to its x64 folder containing `makeappx.exe`.
3. Install Python with Pillow for the Store icon generator, or set `HARDEARNER_PYTHON` to that interpreter.
4. Build the ordinary desktop package first, then run:

```sh
npm --prefix desktop run package:store
```

The script produces an **unsigned** MSIX and a hash/validation report under `.artifacts/packages/`. It packages application files, not local user profiles. Review the archive and validate the installed product through the normal Store release process. Microsoft signing/certification and the private distribution audience are configured in Partner Center, separately from GitHub.

## Release checklist

- Run the two builds, unit tests, browser suites and relevant Windows checks.
- Verify provider changes against authorised test accounts where available; distinguish fixture coverage from live verification.
- Check package version, Worker version, privacy wording and Learn FAST guidance.
- Review the staged file list for secrets and financial data.
- Preserve a recoverable encrypted backup before migrations.
- Confirm the intended private audience and target environment.
- Verify the live deployed/installed version after release; an upload is not proof of certification or successful installation.

Do not place Store binaries, access codes, API secrets, user backups or publisher credentials in GitHub releases.
