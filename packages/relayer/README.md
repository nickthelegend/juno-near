# Juno testnet email relayer

Run `pnpm relayer` from the root after setting `RELAYER_ACCOUNT`, `RELAYER_KEY_FILE`, `JUNO_FACTORY_ACCOUNT`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, and `AUTH_SECRET` in a gitignored `.env`. The key file belongs under `.near-credentials/`. The default server is `http://127.0.0.1:8787`; set `WEB_ORIGIN` to the web app origin. It refuses non-testnet relayer account names.

- `POST /auth/request` sends a six-digit code through the live Resend API. It returns success only after a successful provider response.
- `POST /auth/verify` checks the code, creates a funded named testnet account with the browser's supplied public key, and returns a real creation transaction hash. The server also keeps a recovery full-access key in gitignored `.near-credentials/email-users.json`. On later email verification it adds a new browser key using that recovery key. This mode is custodial.
- `POST /relay` accepts a Borsh-encoded, client-signed NEP-366 delegated action. The server requires a registered player account, one function call, an allowlisted Juno receiver and method, bounded gas and deposits, and per-sender rate limits. It returns a transaction hash only after a real chain response.
- `GET /health` reports whether configuration is present.

`pnpm test:meta` signs a delegated bid with a player key and submits it from a separate relayer on a real local NEAR sandbox. The test reads finalized chain state before it passes. Email delivery cannot be tested without the Resend key and verified sender.
