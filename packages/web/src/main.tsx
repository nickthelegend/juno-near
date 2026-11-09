import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  setupWalletSelector,
  type BrowserWallet,
} from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { actionCreators } from "@near-js/transactions";
import {
  base64,
  buyQuote,
  commitment,
  curveCost,
  dryQuote,
  formatNear,
  market,
  posts,
  TESTNET_RPC,
  type Market,
  YOCTO,
} from "@juno/sdk";
import type { EmailPlayer } from "./email";
import "./styles.css";

const factory = import.meta.env.VITE_FACTORY_ACCOUNT as string | undefined;
const rpc =
  (import.meta.env.VITE_NEAR_RPC_URL as string | undefined) || TESTNET_RPC;
const relayer = import.meta.env.VITE_RELAYER_URL as string | undefined;
const explorer = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
type Entry = { account: string; data: Market };

function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [emailPlayer, setEmailPlayer] = useState<EmailPlayer | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [selector, setSelector] = useState<Awaited<
    ReturnType<typeof setupWalletSelector>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("0.0002");
  const [slug, setSlug] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [dare, setDare] = useState("");
  const [proof, setProof] = useState("");
  const [bond, setBond] = useState("0");
  const [sourceAsset, setSourceAsset] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [quote, setQuote] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!factory) return;
    setupWalletSelector({ network: "testnet", modules: [setupMyNearWallet()] })
      .then(async (s) => {
        setSelector(s);
        const wallet = await s.wallet("my-near-wallet");
        setAccount((await wallet.getAccounts())[0]?.accountId ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);
  const refresh = useCallback(async () => {
    if (!factory) return;
    setLoading(true);
    setError("");
    try {
      const ids = await posts(factory, rpc);
      const all = await Promise.all(
        ids.map(async (account) => ({
          account,
          data: await market(account, rpc),
        })),
      );
      setEntries(all.reverse());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  const active = useMemo(
    () => entries.find((e) => e.account === selected) ?? null,
    [entries, selected],
  );
  const action = async (
    target: string,
    methodName: string,
    args: object,
    deposit: bigint = 0n,
  ) => {
    if (!account) {
      setError("Sign in with email or connect a testnet wallet first.");
      return false;
    }
    setError("");
    setNotice("");
    try {
      if (emailPlayer && relayer) {
        const { relayCall } = await import("./email");
        const hash = await relayCall(
          relayer,
          emailPlayer,
          target,
          methodName,
          args,
          deposit,
          rpc,
        );
        setNotice(`Confirmed transaction: ${hash}`);
        await refresh();
        return true;
      }
      if (!selector) throw Error("Wallet unavailable");
      const wallet = await selector.wallet("my-near-wallet");
      const result = await wallet.signAndSendTransaction({
        receiverId: target,
        actions: [
          actionCreators.functionCall(
            methodName,
            args,
            120n * 10n ** 12n,
            deposit,
          ),
        ],
      });
      if (result) {
        setNotice(`Confirmed transaction: ${result.transaction.hash}`);
        await refresh();
      } else
        setNotice(
          "Wallet opened for signing. The market will refresh after confirmation.",
        );
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  const connect = async () => {
    if (!selector) return;
    const wallet = (await selector.wallet("my-near-wallet")) as BrowserWallet;
    await wallet.signIn({ contractId: factory! });
  };
  const sendEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!relayer) return;
    setError("");
    try {
      const { requestCode } = await import("./email");
      await requestCode(relayer, email);
      setCodeSent(true);
      setNotice("Sign-in code sent. Check your inbox.");
    } catch (e) {
      setError(String(e));
    }
  };
  const finishEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!relayer) return;
    setError("");
    try {
      const { verifyCode } = await import("./email");
      const result = await verifyCode(relayer, email, code);
      setEmailPlayer(result.player);
      setAccount(result.player.accountId);
      setNotice(`Email account ready: ${result.transactionHash}`);
    } catch (e) {
      setError(String(e));
    }
  };
  const placeBid = async () => {
    if (!active || !account) return;
    try {
      const amount = BigInt(quantity);
      const maxPrice = parseNear(price);
      if (amount <= 0n || maxPrice <= 0n)
        throw Error("Enter a positive amount and maximum price.");
      if (amount * maxPrice > YOCTO)
        throw Error("Bid exceeds the fixed 1 NEAR escrow.");
      const key = `juno-bid:${active.account}:${account}`;
      if (localStorage.getItem(key))
        throw Error(
          "A bid secret is already saved for this market. Reveal that bid when the window opens.",
        );
      const secret = crypto.randomUUID();
      localStorage.setItem(
        key,
        JSON.stringify({
          amount: amount.toString(),
          maxPrice: maxPrice.toString(),
          salt: secret,
        }),
      );
      const submitted = await action(
        active.account,
        "commit",
        { commitment: base64(commitment(account, amount, maxPrice, secret)) },
        YOCTO,
      );
      if (!submitted) localStorage.removeItem(key);
    } catch (e) {
      setError(String(e));
    }
  };
  const reveal = async () => {
    if (!active || !account) return;
    const saved = localStorage.getItem(`juno-bid:${active.account}:${account}`);
    if (!saved) {
      setError(
        "Bid secret unavailable in this browser. Reveal requires the original salt.",
      );
      return;
    }
    const bid = JSON.parse(saved);
    await action(active.account, "reveal", {
      amount: bid.amount,
      max_price: bid.maxPrice,
      salt: bid.salt,
    });
  };
  const trade = async (method: "buy" | "sell" | "redeem") => {
    if (!active) return;
    try {
      const q = BigInt(quantity);
      const deposit =
        method === "buy"
          ? buyQuote(
              BigInt(active.data.curve_sold),
              q,
              BigInt(active.data.floor_vault),
              BigInt(active.data.total_supply),
            )
          : 0n;
      await action(active.account, method, { quantity: q.toString() }, deposit);
    } catch (e) {
      setError(String(e));
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factory) return;
    try {
      const bondYocto = parseNear(bond);
      await action(
        factory,
        "create_post",
        {
          slug,
          caption,
          media_url: mediaUrl,
          dare,
          dare_bond: bondYocto.toString(),
        },
        4n * YOCTO + bondYocto,
      );
    } catch (e) {
      setError(String(e));
    }
  };
  const requestQuote = async (event: React.FormEvent) => {
    event.preventDefault();
    setQuote(null);
    setError("");
    const recipient = import.meta.env.VITE_NEAR_MAINNET_ACCOUNT as
      | string
      | undefined;
    if (!recipient) {
      setError("Setup required: VITE_NEAR_MAINNET_ACCOUNT");
      return;
    }
    try {
      setQuote(
        await dryQuote({
          originAsset: sourceAsset,
          destinationAsset: "nep141:wrap.near",
          amount: sourceAmount,
          recipient,
          refundTo: recipient,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <header className="nav">
        <button className="brand" onClick={() => setSelected(null)}>
          juno<span className="brand-star">✳</span>
          <small>NEAR</small>
        </button>
        <div className="nav-right">
          <span className="network">● Testnet</span>
          {account ? (
            <button
              className="account"
              onClick={async () => {
                if (emailPlayer) {
                  setEmailPlayer(null);
                } else
                  await (await selector?.wallet("my-near-wallet"))?.signOut();
                setAccount(null);
              }}
            >
              {account}
            </button>
          ) : (
            <button className="pill" onClick={connect}>
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">THE SOCIAL MARKET · NEAR EDITION</p>
            <h1>
              Every post
              <br />
              is a <em>coin.</em>
            </h1>
            <p className="hero-sub">
              Bots can’t snipe it. Holders can always redeem its floor.
            </p>
            <div className="hero-steps">
              <span>
                <b>01</b> Post a moment
              </span>
              <span>
                <b>02</b> Bid sealed
              </span>
              <span>
                <b>03</b> Trade above floor
              </span>
            </div>
          </div>
          <img src="/art/hero.webp" alt="Juno illustrated market world" />
        </section>
        {!factory && (
          <div className="state setup">
            <b>Setup required: VITE_FACTORY_ACCOUNT</b>
            <span>
              Set the deployed factory account in packages/web/.env and restart
              the app.
            </span>
          </div>
        )}
        {relayer ? (
          <section className="email-signin">
            <div>
              <p className="eyebrow">NO WALLET REQUIRED</p>
              <h2>Sign in with email.</h2>
              <p>
                A testnet account is created for you. A relayer pays transaction
                gas.
              </p>
            </div>
            {emailPlayer ? (
              <span className="email-ready">
                Signed in as {emailPlayer.accountId}
              </span>
            ) : (
              <form onSubmit={codeSent ? finishEmail : sendEmailCode}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                />
                {codeSent && (
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Six-digit code"
                    inputMode="numeric"
                    aria-label="Email code"
                  />
                )}
                <button className="primary">
                  {codeSent ? "Verify and enter" : "Send code"}
                </button>
              </form>
            )}
          </section>
        ) : (
          <div className="state setup">
            <b>
              Setup required: VITE_RELAYER_URL, EMAIL_PROVIDER_API_KEY,
              EMAIL_FROM, AUTH_SECRET, RELAYER_ACCOUNT, RELAYER_KEY_FILE
            </b>
            <span>
              Email sign-in and gasless meta transactions need a configured
              relayer. Wallet actions remain available.
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className="state error">
            <b>Couldn’t complete the action</b>
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="state notice">
            {notice}
          </div>
        )}
        <div className="section-head">
          <div>
            <p className="eyebrow">THE FEED</p>
            <h2>{active ? active.data.slug : "Fresh markets"}</h2>
          </div>
          <button
            className="text-button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        {active ? (
          <section className="market-detail">
            <button className="back" onClick={() => setSelected(null)}>
              ← All posts
            </button>
            <div className="detail-grid">
              <div className="post-main">
                <div className="media-frame">
                  {active.data.media_url ? (
                    <img
                      src={active.data.media_url}
                      alt={active.data.caption}
                    />
                  ) : (
                    <img src="/art/empty.webp" alt="Juno post placeholder" />
                  )}
                </div>
                <p className="creator">
                  by {active.data.creator} ·{" "}
                  <a href={explorer(active.account)} target="_blank">
                    {active.account} ↗
                  </a>
                </p>
                <h3>{active.data.caption}</h3>
                {active.data.dare && (
                  <div className="dare">
                    <b>✳ Dare attached</b>
                    <p>{active.data.dare}</p>
                    <small>
                      Bond {formatNear(BigInt(active.data.dare_bond))} NEAR ·
                      Proof: {active.data.proof || "Waiting for creator"}
                    </small>
                  </div>
                )}
              </div>
              <div className="trade-panel">
                <p className="eyebrow">MARKET STATUS</p>
                <h3>
                  {active.data.phase === "commit"
                    ? "Sealed opening"
                    : active.data.phase === "reveal"
                      ? "Reveal your bid"
                      : active.data.phase === "settle"
                        ? "Awaiting settlement"
                        : active.data.phase === "graduated"
                          ? "Graduated"
                          : "Bonding curve"}
                </h3>
                <div className="countdown">
                  {active.data.phase === "commit"
                    ? countdown(active.data.commit_end_ms - now)
                    : active.data.phase === "reveal"
                      ? countdown(active.data.reveal_end_ms - now)
                      : "—"}
                  <small>
                    {active.data.phase === "commit" ? "until reveal" : " "}
                  </small>
                </div>
                <CurveChart
                  sold={BigInt(active.data.curve_sold)}
                  floor={BigInt(active.data.floor_per_token)}
                />
                <div className="stats">
                  <div>
                    <span>Sealed bids</span>
                    <b>{active.data.sealed_bid_count}</b>
                  </div>
                  <div>
                    <span>Floor / token</span>
                    <b>{formatNear(BigInt(active.data.floor_per_token))} Ⓝ</b>
                  </div>
                  <div>
                    <span>Floor vault</span>
                    <b>{formatNear(BigInt(active.data.floor_vault))} Ⓝ</b>
                  </div>
                  <div>
                    <span>Curve sold</span>
                    <b>{active.data.curve_sold} / 800</b>
                  </div>
                  <div>
                    <span>Creator earned</span>
                    <b>{formatNear(BigInt(active.data.creator_earnings))} Ⓝ</b>
                  </div>
                  <div>
                    <span>Graduation lock</span>
                    <b>{formatNear(BigInt(active.data.graduation_escrow))} Ⓝ</b>
                  </div>
                </div>
                <label>
                  Token amount
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                {active.data.phase === "commit" && (
                  <>
                    <label>
                      Max price per token (NEAR)
                      <input
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <button className="primary" onClick={() => void placeBid()}>
                      Place sealed bid
                    </button>
                    <small className="fine">
                      Every bidder escrows 1 NEAR. Keep this browser until
                      reveal; the salt stays here until you reveal it.
                    </small>
                  </>
                )}
                {active.data.phase === "reveal" && (
                  <button className="primary" onClick={() => void reveal()}>
                    Reveal my bid
                  </button>
                )}
                {active.data.phase === "settle" && (
                  <button
                    className="primary"
                    onClick={() => void action(active.account, "settle", {})}
                  >
                    Settle auction
                  </button>
                )}
                {["curve", "graduated"].includes(active.data.phase) && (
                  <div className="action-row">
                    <button
                      className="primary"
                      disabled={active.data.graduated}
                      onClick={() => void trade("buy")}
                    >
                      Buy
                    </button>
                    <button onClick={() => void trade("sell")}>Sell</button>
                  </div>
                )}
                {["curve", "graduated"].includes(active.data.phase) && (
                  <button
                    className="redeem"
                    onClick={() =>
                      void action(active.account, "claim_refund", {})
                    }
                  >
                    Claim auction refund
                  </button>
                )}
                <button className="redeem" onClick={() => void trade("redeem")}>
                  Burn and redeem floor ↗
                </button>
                {account === active.data.creator && (
                  <button
                    className="redeem"
                    onClick={() =>
                      void action(active.account, "withdraw_earnings", {})
                    }
                  >
                    Withdraw creator earnings
                  </button>
                )}
                {active.data.dare && (
                  <div className="dare-actions">
                    <small className="fine">
                      Dare closes{" "}
                      {new Date(
                        active.data.commit_end_ms + 240_000,
                      ).toLocaleTimeString()}
                    </small>
                    {account === active.data.creator &&
                      !active.data.dare_finalized && (
                        <>
                          <label>
                            Proof link
                            <input
                              type="url"
                              value={proof}
                              onChange={(e) => setProof(e.target.value)}
                              placeholder="https://…"
                            />
                          </label>
                          <button
                            className="redeem"
                            onClick={() =>
                              void action(active.account, "submit_proof", {
                                proof,
                              })
                            }
                          >
                            Submit proof
                          </button>
                        </>
                      )}
                    {!active.data.dare_finalized &&
                      now < active.data.commit_end_ms + 240_000 && (
                        <div className="action-row">
                          <button
                            onClick={() =>
                              void action(active.account, "vote_proof", {
                                accepted: true,
                              })
                            }
                          >
                            Proof passes
                          </button>
                          <button
                            onClick={() =>
                              void action(active.account, "vote_proof", {
                                accepted: false,
                              })
                            }
                          >
                            Flake
                          </button>
                        </div>
                      )}
                    {!active.data.dare_finalized &&
                      now >= active.data.commit_end_ms + 240_000 && (
                        <button
                          className="redeem"
                          onClick={() =>
                            void action(active.account, "finalize_dare", {})
                          }
                        >
                          Finalize dare
                        </button>
                      )}
                    {active.data.dare_finalized && (
                      <button
                        className="redeem"
                        onClick={() =>
                          void action(active.account, "claim_dare", {})
                        }
                      >
                        Claim dare payout
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="feed">
            {entries.length ? (
              entries.map(({ account: id, data }) => (
                <button
                  className="feed-card"
                  key={id}
                  onClick={() => setSelected(id)}
                >
                  <div className="card-media">
                    {data.media_url ? (
                      <img src={data.media_url} alt="" />
                    ) : (
                      <img src="/art/empty.webp" alt="" />
                    )}
                    <span className="phase">{data.phase}</span>
                  </div>
                  <div className="card-body">
                    <span className="handle">
                      @{data.creator.split(".")[0]}
                    </span>
                    <h3>{data.caption}</h3>
                    <div className="card-foot">
                      <span>
                        floor:{" "}
                        <b>{formatNear(BigInt(data.floor_per_token))} Ⓝ</b>
                      </span>
                      <span>{data.sealed_bid_count} sealed bids</span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty">
                <img src="/art/object.webp" alt="" />
                <h3>{loading ? "Loading markets…" : "No posts yet"}</h3>
                <p>
                  {factory
                    ? "Be the first to launch a post market."
                    : "Connect a deployed factory to load real posts."}
                </p>
              </div>
            )}
          </section>
        )}
        <section className="lower-grid">
          <div className="form-panel">
            <p className="eyebrow">CREATE</p>
            <h2>
              Turn a post
              <br />
              into a market.
            </h2>
            <form onSubmit={create}>
              <label>
                Post slug
                <input
                  required
                  pattern="[a-z0-9-]{2,32}"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-first-post"
                />
              </label>
              <label>
                Caption
                <input
                  required
                  maxLength={400}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="What happened?"
                />
              </label>
              <label>
                Photo or reel URL
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label>
                Dare (optional)
                <input
                  value={dare}
                  onChange={(e) => setDare(e.target.value)}
                  placeholder="Prove you did it"
                />
              </label>
              <label>
                Dare bond in NEAR
                <input
                  value={bond}
                  onChange={(e) => setBond(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <button className="primary" disabled={!factory || !account}>
                Launch post market
              </button>
              <small className="fine">
                A named sub-account needs a 4 NEAR storage deposit on testnet.
              </small>
            </form>
          </div>
          <div className="form-panel dark">
            <p className="eyebrow">CROSS-CHAIN</p>
            <h2>
              Bring any coin.
              <br />
              Get a quote.
            </h2>
            <p>1Click mainnet dry quote. No swap is sent from this page.</p>
            <form onSubmit={requestQuote}>
              <label>
                Origin asset ID
                <input
                  required
                  value={sourceAsset}
                  onChange={(e) => setSourceAsset(e.target.value)}
                  placeholder="nep141:wrap.near"
                />
              </label>
              <label>
                Input amount (smallest unit)
                <input
                  required
                  value={sourceAmount}
                  onChange={(e) => setSourceAmount(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <button className="primary">Request dry quote</button>
            </form>
            {quote !== null && <pre>{JSON.stringify(quote, null, 2)}</pre>}
          </div>
        </section>
      </main>
      <footer>
        <span>juno ✳ NEAR</span>
        <span>Post → auction → curve → redeemable floor.</span>
        <a href="https://testnet.nearblocks.io/" target="_blank">
          Testnet explorer ↗
        </a>
      </footer>
    </>
  );
}
function CurveChart({ sold, floor }: { sold: bigint; floor: bigint }) {
  const points = Array.from({ length: 41 }, (_, i) =>
    curveCost(BigInt(Math.min(799, i * 20)), 1n),
  );
  const max = points[40] > floor ? points[40] : floor;
  const y = (v: bigint) => 145 - Number((v * 125n) / (max || 1n));
  const path = points
    .map((p, i) => `${i ? "L" : "M"} ${i * 15} ${y(p)}`)
    .join(" ");
  return (
    <div className="chart">
      <div className="chart-title">
        <b>Curve</b>
        <span>Floor — {formatNear(floor)} Ⓝ</span>
      </div>
      <svg
        viewBox="0 0 600 160"
        role="img"
        aria-label="The 16-segment bonding curve and redeemable floor"
      >
        <line
          x1="0"
          x2="600"
          y1={y(floor)}
          y2={y(floor)}
          stroke="#71965d"
          strokeDasharray="6 5"
          strokeWidth="2"
        />
        <path
          d={path}
          fill="none"
          stroke="#151a11"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line
          x1={(Number(sold) * 600) / 800}
          x2={(Number(sold) * 600) / 800}
          y1="8"
          y2="150"
          stroke="#d6ff3d"
          strokeWidth="4"
        />
      </svg>
      <div className="chart-axis">
        <span>Launch</span>
        <span>{sold.toString()} / 800 sold</span>
        <span>Graduation</span>
      </div>
    </div>
  );
}
function parseNear(input: string): bigint {
  if (!/^\d+(\.\d{0,24})?$/.test(input))
    throw Error("Enter a valid NEAR amount.");
  const [whole, frac = ""] = input.split(".");
  return BigInt(whole) * YOCTO + BigInt(frac.padEnd(24, "0"));
}
function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
