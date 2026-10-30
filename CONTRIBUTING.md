# Working on HardEarner

This is a proprietary project with publicly viewable source. Repository access does not grant permission to redistribute its source or branding.

Start with [development](docs/development.md), [architecture](docs/architecture.md) and [integration scope](docs/integrations.md). Keep the interface calm: make financial evidence and next actions clear, and avoid displaying unsupported capabilities as available.

For changes, use a branch and a pull request. Explain the user-visible problem, the resulting behaviour and the checks run. Use precise fixture tests for accounting, security and persistence changes; include sample-data screenshots when the UI changes.

Preserve distinctions between known purchase cost, estimates, balances and sale proceeds. Do not silently discard history, invent missing costs or hide provider errors. Review desktop and web behaviour together, including mobile widths and Turkish/TRY defaults.

Never commit real credentials, exported portfolios, screenshots of a personal account, deployment access rules or signing material. See [SECURITY.md](SECURITY.md) for private reporting.
