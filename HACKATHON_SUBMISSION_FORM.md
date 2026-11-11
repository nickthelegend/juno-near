# NEAR HACKATHON submission form

Draft for Nick to review and enter in [the official form](https://nearhackathon.com/#apply). Field names and constraints follow [HACKATHON.md](https://nearhackathon.com/HACKATHON.md), checked November 11, 2026. Nothing has been submitted by this task.

| Field | Draft value and constraint |
| --- | --- |
| `projectName` | Juno on NEAR (12 characters; allowed: 2-80) |
| `leadName` | TBD Nick (2-80 characters) |
| `email` | TBD Nick (valid email, max 160 characters; max 2 submissions per email) |
| `size` | TBD Nick: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` |
| `tracks` | Proposed, best fit first: `["memecoins", "defi", "social"]`.<br>`memecoins`: post coins have sealed-bid launches, floor redemption and optional dare bonds.<br>`defi`: contracts settle auctions, curve trades and vault redemptions in NEAR; no cross-chain settlement is claimed.<br>`social`: creators post dares, holders vote on proof, and contract rules return or distribute the bond; no DAO integration is claimed. |
| `nearAddress` | TBD Nick: NEAR MAINNET payout account (2-64 lowercase characters; named or 64-character implicit account, per official validation) |
| `projectUrl` | TBD: public GitHub repo URL after push (HTTP(S), max 300 characters; each repo may be submitted once) |
| `demoUrl` | TBD: the public X post URL (HTTP(S), max 300 characters) |
| `idea` | Meme coin launches reward the fastest transaction, and holders can be left without a buyer. Juno turns photo posts into token markets on NEAR testnet. Each post is a named sub-account with a sealed-bid opening auction, one clearing price, a trading curve and a NEAR floor vault that holders can redeem against. Optional dare bonds let creators post proof and holders vote. The hosted app reads trades and holders from the contracts and supports Meteor testnet wallet signing. Recorded transactions show auctions, trading, graduation, floor redemption and a finalized dare. Juno reuses an earlier Robinhood Chain app and curve; this entry covers the NEAR contracts and integration built for the hackathon. Cross-chain swaps and Rhea pool seeding are not implemented. |
| `consent` | Nick ticks after agreeing to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

Idea character count: **765** (allowed: 20-2000; count includes spaces and punctuation, excludes table markup).

Nick must fill the human fields and the README's other-project disclosure, make the repository public, and publish the demo before **2026-11-14 23:59 UTC**. This task does not push or publish. If using the API instead of the form, generate `requestId` once at submission time and reuse it on retries; it is API metadata, not a human form field. Review the exact payload with Nick before submitting. A saved submission is corrected through [request changes](https://nearhackathon.com/request-changes), not a second submission.

## X post draft

The human posts this text and attaches the video:

```text
launch sniping is a rough welcome. juno gives photo coins a sealed-bid launch and a redeemable NEAR floor. built at NEAR HACKATHON @NEARProtocol #NEARHackathon. try the testnet feed: https://juno-near.vercel.app/social — would you bid or wait?
```

Post character count: **243** (under 280, even before X shortens the URL).

attach: /Volumes/Extreme SSD/Projects/grokbot/videos/juno-near/juno-near-film-share.mp4
