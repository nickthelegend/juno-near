pub mod curve;
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};
use std::collections::BTreeMap;

const N: u128 = 10u128.pow(24);
const OPEN_MS: u64 = 60_000;
const REVEAL_MS: u64 = 60_000;
const DARE_MS: u64 = 300_000;
const AUCTION_UNITS: u128 = 200;
const CURVE_UNITS: u128 = 800;
const BASE: u128 = N / 10_000; // 0.0001 NEAR per whole token
const MAX_BIDS: usize = 64;
const MAX_TRADES: usize = 120;

/// One fill, kept on-chain so a client can draw price history without an indexer.
/// `total` is the NEAR (yocto) that moved for `quantity` whole tokens; `sold_after`
/// is the curve position after the fill.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Trade {
    pub ms: u64,
    pub kind: String,
    pub account: AccountId,
    pub quantity: U128,
    pub total: U128,
    pub sold_after: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Bid {
    pub owner: AccountId,
    pub commitment: Vec<u8>,
    pub escrow: u128,
    pub amount: u128,
    pub max_price: u128,
    pub revealed: bool,
    pub allocated: u128,
    pub refund: u128,
}

#[near(serializers = [json])]
pub struct MarketView {
    pub slug: String,
    pub creator: AccountId,
    pub caption: String,
    pub media_url: String,
    pub phase: String,
    pub commit_end_ms: u64,
    pub reveal_end_ms: u64,
    pub sealed_bid_count: u64,
    pub revealed_bid_count: u64,
    pub clearing_price: U128,
    pub total_supply: U128,
    pub curve_sold: U128,
    pub floor_vault: U128,
    pub floor_per_token: U128,
    pub curve_reserve: U128,
    pub graduation_escrow: U128,
    pub creator_earnings: U128,
    pub graduated: bool,
    pub dare: String,
    pub dare_bond: U128,
    pub proof: String,
    pub dare_finalized: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Juno {
    factory: bool,
    owner: AccountId,
    code: Vec<u8>,
    posts: Vec<AccountId>,
    slug: String,
    creator: AccountId,
    caption: String,
    media_url: String,
    opened_ms: u64,
    bids: Vec<Bid>,
    settled: bool,
    clearing_price: u128,
    balances: BTreeMap<AccountId, u128>,
    supply: u128,
    curve_sold: u128,
    floor_vault: u128,
    curve_reserve: u128,
    graduation_escrow: u128,
    creator_earnings: u128,
    graduated: bool,
    dare: String,
    dare_bond: u128,
    proof: String,
    votes: BTreeMap<AccountId, bool>,
    dare_finalized: bool,
    dare_payouts: BTreeMap<AccountId, u128>,
    trades: Vec<Trade>,
}

fn blank(owner: AccountId) -> Juno {
    Juno { factory: false, owner: owner.clone(), code: vec![], posts: vec![], slug: String::new(), creator: owner,
        caption: String::new(), media_url: String::new(), opened_ms: 0, bids: vec![], settled: false,
        clearing_price: 0, balances: BTreeMap::new(), supply: 0, curve_sold: 0, floor_vault: 0,
        curve_reserve: 0, graduation_escrow: 0, creator_earnings: 0, graduated: false,
        dare: String::new(), dare_bond: 0, proof: String::new(), votes: BTreeMap::new(),
        dare_finalized: false, dare_payouts: BTreeMap::new(), trades: vec![] }
}
fn send(to: &AccountId, amount: u128) {
    if amount > 0 { Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount)).detach(); }
}
fn bid_hash(owner: &AccountId, amount: u128, max_price: u128, salt: &str) -> Vec<u8> {
    env::sha256(format!("juno:v1:{}:{}:{}:{}", owner, amount, max_price, salt).as_bytes())
}

#[near]
impl Juno {
    fn record(&mut self, kind: &str, account: &AccountId, quantity: u128, total: u128) {
        if self.trades.len() >= MAX_TRADES { self.trades.remove(0); }
        self.trades.push(Trade { ms: env::block_timestamp_ms(), kind: kind.into(), account: account.clone(),
            quantity: U128(quantity), total: U128(total), sold_after: U128(self.curve_sold) });
        env::log_str(&format!("EVENT_JSON:{{\"standard\":\"juno\",\"version\":\"1.0.0\",\"event\":\"{}\",\"data\":[{{\"account\":\"{}\",\"quantity\":\"{}\",\"total\":\"{}\"}}]}}", kind, account, quantity, total));
    }
    fn gross_buy(&self, quantity: u128) -> u128 {
        let curve = curve::range_cost(self.curve_sold, quantity, true);
        let floor = if self.supply == 0 { 0 } else {
            (self.floor_vault * quantity + self.supply - 1) / self.supply
        };
        curve.max(floor)
    }
    #[init]
    pub fn init_factory() -> Self {
        let mut state = blank(env::predecessor_account_id());
        state.factory = true;
        state
    }

    #[init]
    pub fn init_token(slug: String, creator: AccountId, caption: String, media_url: String, dare: String, dare_bond: U128) -> Self {
        require!(env::predecessor_account_id() == env::current_account_id().as_str().split_once('.').unwrap().1.parse::<AccountId>().unwrap(), "ERR_PARENT_ONLY");
        require!(caption.len() <= 400 && media_url.len() <= 300 && dare.len() <= 300, "ERR_METADATA");
        let mut s = blank(creator.clone());
        s.slug = slug; s.creator = creator; s.caption = caption; s.media_url = media_url;
        s.opened_ms = env::block_timestamp_ms(); s.dare = dare; s.dare_bond = dare_bond.0;
        s
    }

    pub fn upload_code(&mut self, code: near_sdk::json_types::Base64VecU8) {
        require!(self.factory && env::predecessor_account_id() == self.owner, "ERR_OWNER");
        require!(!code.0.is_empty() && self.code.is_empty(), "ERR_CODE_LOCKED");
        self.code = code.0;
    }

    #[payable]
    pub fn create_post(&mut self, slug: String, caption: String, media_url: String, dare: String, dare_bond: U128) -> AccountId {
        require!(self.factory && !self.code.is_empty(), "ERR_FACTORY_SETUP");
        require!(slug.len() >= 2 && slug.len() <= 32 && slug.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'), "ERR_SLUG");
        require!(caption.len() <= 400 && media_url.len() <= 300 && dare.len() <= 300, "ERR_METADATA");
        let account: AccountId = format!("{}.{}", slug, env::current_account_id()).parse().unwrap();
        require!(!self.posts.contains(&account), "ERR_DUPLICATE");
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= 3 * N + dare_bond.0, "ERR_STORAGE_DEPOSIT");
        require!(dare_bond.0 == 0 || !dare.is_empty(), "ERR_DARE");
        let creator = env::predecessor_account_id();
        self.posts.push(account.clone());
        let args = near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"slug":slug,"creator":creator,"caption":caption,"media_url":media_url,"dare":dare,"dare_bond":dare_bond})).unwrap();
        Promise::new(account.clone()).create_account().transfer(NearToken::from_yoctonear(attached)).deploy_contract(self.code.clone())
            .function_call("init_token", args, NearToken::from_yoctonear(0), near_sdk::Gas::from_tgas(30)).detach();
        account
    }

    pub fn posts(&self) -> Vec<AccountId> { require!(self.factory, "ERR_FACTORY_ONLY"); self.posts.clone() }
    pub fn code_ready(&self) -> bool { self.factory && !self.code.is_empty() }

    #[payable]
    pub fn commit(&mut self, commitment: near_sdk::json_types::Base64VecU8) {
        require!(!self.factory && env::block_timestamp_ms() < self.opened_ms + OPEN_MS, "ERR_COMMIT_CLOSED");
        require!(commitment.0.len() == 32 && self.bids.len() < MAX_BIDS, "ERR_COMMITMENT");
        let owner = env::predecessor_account_id();
        require!(!self.bids.iter().any(|b| b.owner == owner), "ERR_DUPLICATE_BID");
        let escrow = env::attached_deposit().as_yoctonear();
        require!(escrow == N, "ERR_FIXED_ESCROW");
        self.bids.push(Bid { owner, commitment: commitment.0, escrow, amount: 0, max_price: 0, revealed: false, allocated: 0, refund: 0 });
    }

    pub fn reveal(&mut self, amount: U128, max_price: U128, salt: String) {
        let now = env::block_timestamp_ms();
        require!(now >= self.opened_ms + OPEN_MS && now < self.opened_ms + OPEN_MS + REVEAL_MS, "ERR_REVEAL_WINDOW");
        require!(amount.0 > 0 && amount.0 <= AUCTION_UNITS && max_price.0 >= BASE && salt.len() <= 80, "ERR_BID");
        let owner = env::predecessor_account_id();
        let hash = bid_hash(&owner, amount.0, max_price.0, &salt);
        let b = self.bids.iter_mut().find(|b| b.owner == owner).expect("ERR_NO_COMMIT");
        require!(!b.revealed && b.commitment == hash, "ERR_HASH");
        require!(amount.0.checked_mul(max_price.0).expect("overflow") <= b.escrow, "ERR_ESCROW");
        b.amount = amount.0; b.max_price = max_price.0; b.revealed = true;
    }

    pub fn settle(&mut self) {
        require!(!self.factory && !self.settled && env::block_timestamp_ms() >= self.opened_ms + OPEN_MS + REVEAL_MS, "ERR_SETTLE_WINDOW");
        let mut order: Vec<usize> = (0..self.bids.len()).filter(|&i| self.bids[i].revealed).collect();
        order.sort_by(|&a, &b| self.bids[b].max_price.cmp(&self.bids[a].max_price).then_with(|| a.cmp(&b)));
        let mut left = AUCTION_UNITS;
        for &i in &order {
            let take = self.bids[i].amount.min(left);
            self.bids[i].allocated = take;
            if take > 0 { self.clearing_price = self.bids[i].max_price; left -= take; }
        }
        let fills: Vec<(AccountId, u128)> = self.bids.iter().filter(|b| b.revealed && b.allocated > 0).map(|b| (b.owner.clone(), b.allocated)).collect();
        for b in &mut self.bids {
            if b.revealed {
                let paid = b.allocated * self.clearing_price;
                b.refund = b.escrow - paid;
                if b.allocated > 0 { *self.balances.entry(b.owner.clone()).or_default() += b.allocated; self.supply += b.allocated; }
                self.floor_vault += paid / 2;
                self.graduation_escrow += paid - paid / 2;
            } else {
                let penalty = b.escrow / 100;
                b.refund = b.escrow - penalty;
                self.creator_earnings += penalty;
            }
        }
        self.settled = true;
        let price = self.clearing_price;
        for (owner, allocated) in fills { self.record("auction", &owner, allocated, allocated * price); }
    }

    pub fn claim_refund(&mut self) -> U128 {
        require!(self.settled, "ERR_NOT_SETTLED");
        let owner = env::predecessor_account_id();
        let b = self.bids.iter_mut().find(|b| b.owner == owner).expect("ERR_NO_BID");
        let refund = b.refund; b.refund = 0; send(&owner, refund); U128(refund)
    }

    #[payable]
    pub fn buy(&mut self, quantity: U128) -> U128 {
        require!(self.settled && !self.graduated, "ERR_CURVE_CLOSED");
        let gross = self.gross_buy(quantity.0);
        let floor = gross / 5; // 20% of curve gross is added to the floor
        let fee = gross / 100;
        let total = gross + floor + fee;
        let paid = env::attached_deposit().as_yoctonear();
        require!(paid >= total, "ERR_PAYMENT");
        self.floor_vault += floor;
        self.curve_reserve += gross;
        self.creator_earnings += fee / 2;
        self.graduation_escrow += fee - fee / 2;
        self.curve_sold += quantity.0;
        self.supply += quantity.0;
        *self.balances.entry(env::predecessor_account_id()).or_default() += quantity.0;
        if self.curve_sold == CURVE_UNITS { self.graduated = true; }
        self.record("buy", &env::predecessor_account_id(), quantity.0, total);
        send(&env::predecessor_account_id(), paid - total);
        U128(total)
    }

    pub fn sell(&mut self, quantity: U128) -> U128 {
        require!(self.settled && quantity.0 > 0 && quantity.0 <= self.curve_sold, "ERR_SELL");
        let owner = env::predecessor_account_id();
        let balance = *self.balances.get(&owner).unwrap_or(&0);
        require!(balance >= quantity.0, "ERR_BALANCE");
        let gross = curve::range_cost(self.curve_sold - quantity.0, quantity.0, false);
        let floor_gross = self.floor_vault * quantity.0 / self.supply;
        let from_floor = gross < floor_gross;
        let actual_gross = if from_floor { floor_gross } else { gross };
        let fee = actual_gross / 100;
        let payout = actual_gross - fee;
        if from_floor { require!(self.floor_vault >= actual_gross, "ERR_FLOOR"); self.floor_vault -= actual_gross; }
        else { require!(self.curve_reserve >= gross, "ERR_RESERVE"); self.curve_reserve -= gross; }
        self.balances.insert(owner.clone(), balance - quantity.0);
        self.supply -= quantity.0;
        self.curve_sold -= quantity.0;
        self.creator_earnings += fee / 2;
        self.graduation_escrow += fee - fee / 2;
        self.graduated = false;
        self.record("sell", &owner, quantity.0, payout);
        send(&owner, payout);
        U128(payout)
    }

    pub fn redeem(&mut self, quantity: U128) -> U128 {
        require!(!self.factory && quantity.0 > 0 && self.supply > 0, "ERR_REDEEM");
        let owner = env::predecessor_account_id();
        let balance = *self.balances.get(&owner).unwrap_or(&0);
        require!(balance >= quantity.0, "ERR_BALANCE");
        let pro_rata = self.floor_vault * quantity.0 / self.supply;
        let payout = pro_rata - pro_rata / 100; // 1% remains for surviving holders
        self.floor_vault -= payout;
        self.balances.insert(owner.clone(), balance - quantity.0);
        self.supply -= quantity.0;
        self.record("redeem", &owner, quantity.0, payout);
        send(&owner, payout);
        U128(payout)
    }

    pub fn withdraw_earnings(&mut self) -> U128 {
        require!(env::predecessor_account_id() == self.creator, "ERR_CREATOR");
        let amount = self.creator_earnings; self.creator_earnings = 0; send(&self.creator, amount); U128(amount)
    }

    pub fn submit_proof(&mut self, proof: String) {
        require!(env::predecessor_account_id() == self.creator && !self.dare.is_empty() && proof.len() <= 300, "ERR_PROOF");
        require!(env::block_timestamp_ms() < self.opened_ms + DARE_MS, "ERR_DARE_CLOSED");
        self.proof = proof;
    }
    pub fn vote_proof(&mut self, accepted: bool) {
        require!(!self.dare.is_empty() && self.settled && env::block_timestamp_ms() < self.opened_ms + DARE_MS, "ERR_VOTE_WINDOW");
        let voter = env::predecessor_account_id();
        require!(*self.balances.get(&voter).unwrap_or(&0) > 0 && !self.votes.contains_key(&voter), "ERR_VOTE");
        self.votes.insert(voter, accepted);
    }
    pub fn finalize_dare(&mut self) {
        require!(!self.dare.is_empty() && !self.dare_finalized && env::block_timestamp_ms() >= self.opened_ms + DARE_MS, "ERR_DARE_WINDOW");
        self.dare_finalized = true;
        let mut yes = 0u128; let mut no = 0u128;
        for (v, accepted) in &self.votes { if *accepted { yes += self.balances.get(v).copied().unwrap_or(0) } else { no += self.balances.get(v).copied().unwrap_or(0) } }
        if !self.proof.is_empty() && yes > no { let bond = self.dare_bond; self.dare_bond = 0; send(&self.creator, bond); }
        else {
            let total: u128 = self.balances.values().sum();
            if total == 0 { self.floor_vault += self.dare_bond; self.dare_bond = 0; }
            else {
                let bond = self.dare_bond; let mut assigned = 0;
                for (holder, balance) in &self.balances { let payout = bond * *balance / total; self.dare_payouts.insert(holder.clone(), payout); assigned += payout; }
                self.floor_vault += bond - assigned; self.dare_bond = 0;
            }
        }
    }
    pub fn claim_dare(&mut self) -> U128 {
        let owner = env::predecessor_account_id();
        let payout = self.dare_payouts.remove(&owner).unwrap_or(0); send(&owner, payout); U128(payout)
    }

    pub fn market(&self) -> MarketView {
        require!(!self.factory, "ERR_MARKET_ONLY");
        let now = env::block_timestamp_ms();
        let phase = if now < self.opened_ms + OPEN_MS { "commit" } else if now < self.opened_ms + OPEN_MS + REVEAL_MS { "reveal" } else if !self.settled { "settle" } else if self.graduated { "graduated" } else { "curve" };
        MarketView { slug: self.slug.clone(), creator: self.creator.clone(), caption: self.caption.clone(), media_url: self.media_url.clone(), phase: phase.into(), commit_end_ms: self.opened_ms + OPEN_MS,
            reveal_end_ms: self.opened_ms + OPEN_MS + REVEAL_MS, sealed_bid_count: self.bids.len() as u64,
            revealed_bid_count: self.bids.iter().filter(|b| b.revealed).count() as u64, clearing_price: U128(self.clearing_price),
            total_supply: U128(self.supply), curve_sold: U128(self.curve_sold), floor_vault: U128(self.floor_vault),
            floor_per_token: U128(if self.supply == 0 { 0 } else { self.floor_vault / self.supply }), curve_reserve: U128(self.curve_reserve),
            graduation_escrow: U128(self.graduation_escrow), creator_earnings: U128(self.creator_earnings), graduated: self.graduated,
            dare: self.dare.clone(), dare_bond: U128(self.dare_bond), proof: self.proof.clone(), dare_finalized: self.dare_finalized }
    }
    /// The newest fills, oldest first (at most 120 are kept).
    pub fn trades(&self) -> Vec<Trade> { self.trades.clone() }
    /// Every account holding a non-zero balance, largest first.
    pub fn holders(&self) -> Vec<(AccountId, U128)> {
        let mut list: Vec<(AccountId, U128)> = self.balances.iter().filter(|(_, b)| **b > 0).map(|(a, b)| (a.clone(), U128(*b))).collect();
        list.sort_by(|a, b| b.1 .0.cmp(&a.1 .0));
        list
    }
    pub fn quote_buy(&self, quantity: U128) -> U128 { let gross = self.gross_buy(quantity.0); U128(gross + gross / 5 + gross / 100) }
    pub fn ft_total_supply(&self) -> U128 { U128(self.supply) }
    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 { U128(*self.balances.get(&account_id).unwrap_or(&0)) }
    pub fn ft_metadata(&self) -> near_sdk::serde_json::Value { near_sdk::serde_json::json!({"spec":"ft-1.0.0","name":self.slug,"symbol":self.slug.to_uppercase(),"decimals":0}) }
    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, _memo: Option<String>) {
        near_sdk::assert_one_yocto();
        require!(!self.factory && amount.0 > 0, "ERR_TRANSFER");
        let sender = env::predecessor_account_id();
        let balance = self.balances.get(&sender).copied().unwrap_or(0);
        require!(balance >= amount.0, "ERR_BALANCE");
        self.balances.insert(sender, balance - amount.0);
        *self.balances.entry(receiver_id).or_default() += amount.0;
    }

    #[payable]
    pub fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> Promise {
        self.ft_transfer(receiver_id.clone(), amount, memo);
        let sender_id=env::predecessor_account_id();
        let args=near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"sender_id":sender_id,"amount":amount,"msg":msg})).unwrap();
        let resolve=near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"sender_id":sender_id,"receiver_id":receiver_id,"amount":amount})).unwrap();
        Promise::new(receiver_id).function_call("ft_on_transfer",args,NearToken::from_yoctonear(0),Gas::from_tgas(30))
            .then(Promise::new(env::current_account_id()).function_call("ft_resolve_transfer",resolve,NearToken::from_yoctonear(0),Gas::from_tgas(30)))
    }

    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let unused=env::promise_result_checked(0,64).ok()
            .and_then(|bytes|near_sdk::serde_json::from_slice::<U128>(&bytes).ok())
            .map(|v|v.0).unwrap_or(amount.0);
        let receiver_balance=self.balances.get(&receiver_id).copied().unwrap_or(0);
        let refund=unused.min(amount.0).min(receiver_balance);
        if refund>0 {
            self.balances.insert(receiver_id,receiver_balance-refund);
            *self.balances.entry(sender_id).or_default()+=refund;
        }
        U128(amount.0-refund)
    }
}
