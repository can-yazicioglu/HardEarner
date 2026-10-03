# Development

## Requirements

- Node.js **24.x**, with npm, and Git.
- Windows for the Electron desktop target. Mac and Linux can build and test the web and shared modules.
- Chromium and WebKit installed by Playwright for browser tests.
- No API keys or cloud account are required for fixture tests.

```sh
npm run setup
npm run build
npm test
```

The root has no dependency installation of its own. Setup runs `npm ci` separately in `desktop/` and `web/`, using their lockfiles. If your npm policy blocks a package install script, review the named dependency; esbuild, Electron and workerd may need their binary installation steps.

## Useful commands

| Command | Result |
| --- | --- |
| `npm run setup` | Installs locked desktop and web dependencies. |
| `npm run build` | Builds `desktop/dist`, `web/dist` and `web/build/worker.mjs`. |
| `npm run start:desktop` | Launches Windows Electron with a separate development profile. |
| `npm run demo:web` | Starts the local, temporary web test harness at `http://127.0.0.1:8794`. |
| `npm test` | Runs desktop and web unit/integration tests, preparing the test Worker first. |
| `npm run test:web-ui` | Starts and stops its own local server; runs three suites in both Chromium and WebKit. |
| `npm run test:desktop-ui` | Runs two Electron UI suites with synthetic providers and separate temporary profiles. |

Prepare browser engines with:

```sh
node desktop/node_modules/playwright/cli.js install chromium webkit
```

On Linux CI, use `install --with-deps chromium webkit`. Stop a manually running demo before starting the browser test runner; both use port 8794. Screenshots and test profiles go under ignored `.artifacts/`.

The web preview has a synthetic identity and memory-only storage. Use test passwords and sample records. Its provider relay is real code, so **never enter real account credentials into the preview**. Browser tests stub provider responses themselves.

## Editing a shared feature

1. Edit the shared UI or core under `desktop/`, and review the adapter in `web/`.
2. Run both builds. Platform-specific substitutions must still match their expected source.
3. Run meaningful tests for the changed accounting, history or persistence behaviour.
4. For UI or vault changes, run the browser suites; for native behaviour, also test Electron on Windows.
5. Use sample accounts and separate profiles. Keep exported backups, logs with personal data and real provider credentials out of commits.

Neither tests nor CI deploy the website, sign packages, submit to Microsoft or modify a production vault. See [deployment](deployment.md) for those separate release steps.

## Test coverage

The initial repository snapshot contains 180 desktop/core tests and 19 web tests. Coverage includes money validation, acquisition lots, transfer matching, fees, provider response parsing, Kraken retries, streaming, investments, encrypted file recovery, vault identity, revision conflicts and bounded request handling.

Browser suites cover cross-device vault saves, separate identities, wrong-password rejection, encrypted backup/restore, password rotation, in-flight lock safety, visible pen/line drawings, streamed candle updates, alerts, securities and responsive navigation. Test evidence establishes behaviour against fixtures, not continuous live-provider availability.

## Dependency changes

Commit the matching lockfile whenever changing dependencies. The original manifests contain a few broad development-tool ranges; `npm ci` still installs exact locked versions. Review Electron and Worker runtime upgrades independently before distribution. The package versions identify source compatibility and are not evidence that a Store submission has been approved.

The desktop manifest pins the transitive `@electron/osx-sign` dependency to 2.7.1 because the previously cached 2.9.0 archive is no longer available from npm. This stays within the packager's compatible range and keeps fresh installations reproducible. The shipping desktop target remains Windows.
