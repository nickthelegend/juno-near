# NEAR HACKATHON submission fields

Source: [current HACKATHON.md](https://nearhackathon.com/HACKATHON.md), "What the human decides" and submission API. This file is a checklist, not a submitted payload. Do not send the API request until Nick reviews the exact JSON payload and confirms it.

| API field | Value for Nick to confirm |
| --- | --- |
| `requestId` | TBD by Nick at submission time; generate once and reuse on retries |
| `projectName` | TBD by Nick (2–80 characters) |
| `leadName` | TBD by Nick (2–80 characters) |
| `email` | TBD by Nick (valid, at most 160 characters) |
| `size` | TBD by Nick: `1`, `2 - 4`, `4 - 6`, `6 - 8`, or `8+` |
| `tracks` | Proposed `memecoins`, `social`; TBD by Nick |
| `nearAddress` | TBD by Nick; mainnet prize payout account |
| `projectUrl` | TBD by Nick; public repository URL |
| `demoUrl` | TBD by Nick; Nick's public X demo post |
| `idea` | TBD by Nick (20–2000 characters): problem, product, and NEAR's role |
| `consent` | TBD by Nick after reading the notice below |

Consent notice to read verbatim: "I agree that the organizers may use these details to review our submission and contact us about this hackathon."

The demo post must say the project was built at NEAR HACKATHON, tag `@NEARProtocol`, include `#NEARHackathon`, and attach a demo video or screenshots. Nick publishes it. Nick must disclose any second project in the README before submitting. The repo must be public before **2026-11-14 23:59 UTC**. Submit only once after Nick confirms every field and the full payload; errors in a saved submission use the organizers' request-changes route.
