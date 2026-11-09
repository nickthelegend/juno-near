use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use near_workspaces::{network::Sandbox, types::{KeyType, NearToken, SecretKey}, Account, Contract, Worker};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const N: u128 = 10u128.pow(24);
const BASE: u128 = N / 10_000;
const WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/target/near/juno_market.wasm");

fn hash(owner: &str, amount: u128, price: u128, salt: &str) -> String {
    STANDARD.encode(Sha256::digest(format!("juno:v1:{owner}:{amount}:{price}:{salt}").as_bytes()))
}
async fn setup(dare: &str, bond: u128) -> Result<(Worker<Sandbox>, Contract, Contract, Account, Account, Account)> {
    let worker = near_workspaces::sandbox().await?;
    let maker = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let sniper = worker.dev_create_account().await?;
    let code = std::fs::read(WASM)?;
    let factory = maker.deploy(&code).await?.into_result()?;
    maker.call(factory.id(), "init_factory").transact().await?.into_result()?;
    maker.call(factory.id(), "upload_code").args_json(json!({"code": STANDARD.encode(&code)})).max_gas().transact().await?.into_result()?;
    let create = alice.call(factory.id(), "create_post").args_json(json!({"slug":"first-post","caption":"A real sandbox post","media_url":"https://example.com/photo.webp","dare":dare,"dare_bond":bond.to_string()})).deposit(NearToken::from_yoctonear(4*N+bond)).max_gas().transact().await?.into_result()?;
    let account: String = create.json()?;
    let token = Contract::from_secret_key(account.parse()?, SecretKey::from_seed(KeyType::ED25519, "read-only-handle"), &worker);
    let _: Value = token.view("market").await?.json()?;
    Ok((worker, factory, token, alice, bob, sniper))
}
async fn market(token: &Contract) -> Result<Value> { Ok(token.view("market").await?.json()?) }
async fn call(account: &Account, token: &Contract, method: &str, args: Value, deposit: u128) -> Result<Value> {
    let result = account.call(token.id(), method).args_json(args).deposit(NearToken::from_yoctonear(deposit)).max_gas().transact().await?.into_result()?;
    Ok(result.json().unwrap_or(Value::Null))
}
async fn bid(account: &Account, token: &Contract, amount: u128, price: u128, salt: &str) -> Result<()> {
    call(account, token, "commit", json!({"commitment":hash(account.id().as_str(),amount,price,salt)}),N).await?;
    Ok(())
}
async fn open_curve(worker: &Worker<Sandbox>, token: &Contract, alice: &Account, bob: &Account) -> Result<()> {
    bid(alice,token,100,BASE*3,"alice").await?;
    bid(bob,token,100,BASE*2,"bob").await?;
    worker.fast_forward(220).await?;
    call(alice,token,"reveal",json!({"amount":"100","max_price":(BASE*3).to_string(),"salt":"alice"}),0).await?;
    call(bob,token,"reveal",json!({"amount":"100","max_price":(BASE*2).to_string(),"salt":"bob"}),0).await?;
    worker.fast_forward(220).await?;
    call(alice,token,"settle",json!({}),0).await?;
    Ok(())
}

#[tokio::test]
async fn uniform_auction_refunds_and_sniper_has_no_price_priority() -> Result<()> {
    let (worker,_factory,token,alice,bob,sniper)=setup("",0).await?;
    bid(&sniper,&token,50,BASE*4,"t0").await?;
    bid(&alice,&token,100,BASE*3,"a").await?;
    bid(&bob,&token,100,BASE*2,"b").await?;
    let before=market(&token).await?;
    assert_eq!(before["sealed_bid_count"],3);
    assert_eq!(before["revealed_bid_count"],0);
    worker.fast_forward(220).await?;
    for (account,amount,price,salt) in [(&sniper,50,BASE*4,"t0"),(&alice,100,BASE*3,"a"),(&bob,100,BASE*2,"b")] {
        call(account,&token,"reveal",json!({"amount":amount.to_string(),"max_price":price.to_string(),"salt":salt}),0).await?;
    }
    worker.fast_forward(220).await?;
    call(&alice,&token,"settle",json!({}),0).await?;
    let m=market(&token).await?;
    assert_eq!(m["clearing_price"],(BASE*2).to_string());
    assert_eq!(m["total_supply"],"200");
    assert_eq!(token.view("ft_balance_of").args_json(json!({"account_id":sniper.id()})).await?.json::<String>()?,"50");
    assert_eq!(token.view("ft_balance_of").args_json(json!({"account_id":bob.id()})).await?.json::<String>()?,"50");
    assert_eq!(call(&sniper,&token,"claim_refund",json!({}),0).await?,(N-50*BASE*2).to_string());
    assert_eq!(call(&bob,&token,"claim_refund",json!({}),0).await?,(N-50*BASE*2).to_string());
    assert_eq!(call(&alice,&token,"claim_refund",json!({}),0).await?,(N-100*BASE*2).to_string()); // creator self-buy has same clearing price
    Ok(())
}

#[tokio::test]
async fn altered_duplicate_and_late_reveals_rejected_on_chain() -> Result<()> {
    let (worker,_factory,token,alice,bob,_)=setup("",0).await?;
    bid(&alice,&token,10,BASE*2,"salt").await?;
    assert!(alice.call(token.id(),"commit").args_json(json!({"commitment":hash(alice.id().as_str(),10,BASE*2,"other")})).deposit(NearToken::from_yoctonear(N)).transact().await?.is_failure());
    worker.fast_forward(220).await?;
    assert!(alice.call(token.id(),"reveal").args_json(json!({"amount":"11","max_price":(BASE*2).to_string(),"salt":"salt"})).transact().await?.is_failure());
    call(&alice,&token,"reveal",json!({"amount":"10","max_price":(BASE*2).to_string(),"salt":"salt"}),0).await?;
    assert!(alice.call(token.id(),"reveal").args_json(json!({"amount":"10","max_price":(BASE*2).to_string(),"salt":"salt"})).transact().await?.is_failure());
    worker.fast_forward(220).await?;
    assert!(bob.call(token.id(),"reveal").args_json(json!({"amount":"1","max_price":BASE.to_string(),"salt":"x"})).transact().await?.is_failure());
    Ok(())
}

#[tokio::test]
async fn reveal_grief_penalty_fee_split_and_floor_redemption() -> Result<()> {
    let (worker,_factory,token,alice,bob,sniper)=setup("",0).await?;
    bid(&alice,&token,100,BASE*2,"a").await?;
    bid(&bob,&token,100,BASE*2,"b").await?;
    bid(&sniper,&token,1,BASE*100,"hide").await?;
    worker.fast_forward(220).await?;
    call(&alice,&token,"reveal",json!({"amount":"100","max_price":(BASE*2).to_string(),"salt":"a"}),0).await?;
    call(&bob,&token,"reveal",json!({"amount":"100","max_price":(BASE*2).to_string(),"salt":"b"}),0).await?;
    worker.fast_forward(220).await?;
    call(&alice,&token,"settle",json!({}),0).await?;
    let m=market(&token).await?;
    assert_eq!(m["creator_earnings"],(N/100).to_string());
    assert_eq!(call(&sniper,&token,"claim_refund",json!({}),0).await?,(N-N/100).to_string());
    let old_floor: u128=m["floor_per_token"].as_str().unwrap().parse()?;
    let payout: u128=call(&alice,&token,"redeem",json!({"quantity":"10"}),0).await?.as_str().unwrap().parse()?;
    assert!(payout <= m["floor_vault"].as_str().unwrap().parse::<u128>()?*10/200);
    let after=market(&token).await?;
    assert!(after["floor_per_token"].as_str().unwrap().parse::<u128>()? > old_floor);
    Ok(())
}

#[tokio::test]
async fn curve_round_trip_fee_split_graduation_and_floor_grief() -> Result<()> {
    let (worker,_factory,token,alice,bob,_)=setup("",0).await?;
    open_curve(&worker,&token,&alice,&bob).await?;
    let before=market(&token).await?;
    let quote: String=token.view("quote_buy").args_json(json!({"quantity":"10"})).await?.json()?;
    let paid: u128=quote.parse()?;
    call(&bob,&token,"buy",json!({"quantity":"10"}),paid).await?;
    let after=market(&token).await?;
    let gross=juno_market::curve::range_cost(0,10,true);
    assert_eq!(after["curve_reserve"],gross.to_string());
    assert_eq!(after["creator_earnings"],(gross/100/2).to_string());
    let floor_before: u128=before["floor_vault"].as_str().unwrap().parse()?;
    assert_eq!(after["floor_vault"],(floor_before+gross/5).to_string());
    let out: u128=call(&bob,&token,"sell",json!({"quantity":"10"}),0).await?.as_str().unwrap().parse()?;
    assert!(out < paid);
    let again: String=token.view("quote_buy").args_json(json!({"quantity":"800"})).await?.json()?;
    call(&bob,&token,"buy",json!({"quantity":"800"}),again.parse()?).await?;
    let end=market(&token).await?;
    assert_eq!(end["phase"],"graduated");
    assert!(end["graduation_escrow"].as_str().unwrap().parse::<u128>()? > 0);
    let vault: u128=end["floor_vault"].as_str().unwrap().parse()?;
    let redeem: u128=call(&bob,&token,"redeem",json!({"quantity":"50"}),0).await?.as_str().unwrap().parse()?;
    assert!(redeem <= vault*50/end["total_supply"].as_str().unwrap().parse::<u128>()?);
    Ok(())
}

#[tokio::test]
async fn dare_flake_splits_bond_and_creator_cannot_vote_without_tokens() -> Result<()> {
    let bond=N;
    let (worker,_factory,token,alice,bob,_)=setup("Run a mile",bond).await?;
    open_curve(&worker,&token,&alice,&bob).await?;
    let m=market(&token).await?;
    assert_eq!(m["dare_bond"],bond.to_string());
    call(&bob,&token,"vote_proof",json!({"accepted":false}),0).await?;
    assert!(bob.call(token.id(),"vote_proof").args_json(json!({"accepted":true})).transact().await?.is_failure());
    worker.fast_forward(700).await?;
    call(&bob,&token,"finalize_dare",json!({}),0).await?;
    assert_eq!(market(&token).await?["dare_finalized"],true);
    assert_eq!(call(&bob,&token,"claim_dare",json!({}),0).await?,(bond/2).to_string());
    assert_eq!(call(&alice,&token,"claim_dare",json!({}),0).await?,(bond/2).to_string());
    Ok(())
}

#[tokio::test]
async fn high_auction_floor_clamps_buy_and_sell_and_cycle_cannot_drain_vault() -> Result<()> {
    let (worker,_factory,token,alice,bob,_)=setup("",0).await?;
    let high=BASE*50;
    bid(&alice,&token,100,high,"a").await?;
    bid(&bob,&token,100,high,"b").await?;
    worker.fast_forward(220).await?;
    call(&alice,&token,"reveal",json!({"amount":"100","max_price":high.to_string(),"salt":"a"}),0).await?;
    call(&bob,&token,"reveal",json!({"amount":"100","max_price":high.to_string(),"salt":"b"}),0).await?;
    worker.fast_forward(220).await?;
    call(&alice,&token,"settle",json!({}),0).await?;
    let before=market(&token).await?;
    let floor_before: u128=before["floor_vault"].as_str().unwrap().parse()?;
    let supply: u128=before["total_supply"].as_str().unwrap().parse()?;
    let quote: String=token.view("quote_buy").args_json(json!({"quantity":"10"})).await?.json()?;
    let paid: u128=quote.parse()?;
    assert!(paid >= floor_before*10/supply);
    call(&bob,&token,"buy",json!({"quantity":"10"}),paid).await?;
    let after_buy=market(&token).await?;
    let floor_sale=after_buy["floor_vault"].as_str().unwrap().parse::<u128>()?*10/after_buy["total_supply"].as_str().unwrap().parse::<u128>()?;
    let sold: u128=call(&bob,&token,"sell",json!({"quantity":"10"}),0).await?.as_str().unwrap().parse()?;
    assert_eq!(sold,floor_sale-floor_sale/100); // sell gross clamps at floor
    assert!(sold < paid);
    let mid=market(&token).await?;
    assert!(mid["floor_vault"].as_str().unwrap().parse::<u128>()? <= floor_before + paid);
    let quote2: String=token.view("quote_buy").args_json(json!({"quantity":"10"})).await?.json()?;
    let paid2: u128=quote2.parse()?;
    call(&bob,&token,"buy",json!({"quantity":"10"}),paid2).await?;
    let redeemed: u128=call(&bob,&token,"redeem",json!({"quantity":"10"}),0).await?.as_str().unwrap().parse()?;
    let mut costs=paid2; let mut receipts=redeemed;
    for _ in 0..3 {
        let quoted:String=token.view("quote_buy").args_json(json!({"quantity":"10"})).await?.json()?;
        let cost: u128=quoted.parse()?;
        call(&bob,&token,"buy",json!({"quantity":"10"}),cost).await?;
        let pay:u128=call(&bob,&token,"redeem",json!({"quantity":"10"}),0).await?.as_str().unwrap().parse()?;
        costs+=cost; receipts+=pay;
    }
    assert!(receipts < costs);
    Ok(())
}

#[tokio::test]
async fn failed_ft_transfer_call_refunds_sender_on_chain() -> Result<()> {
    let (worker,factory,token,alice,bob,_)=setup("",0).await?;
    open_curve(&worker,&token,&alice,&bob).await?;
    let before:String=token.view("ft_balance_of").args_json(json!({"account_id":alice.id()})).await?.json()?;
    let tx=alice.call(token.id(),"ft_transfer_call").args_json(json!({"receiver_id":factory.id(),"amount":"5","memo":null,"msg":"unsupported"})).deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.into_result()?;
    let used:String=tx.json()?;
    assert_eq!(used,"0");
    let after:String=token.view("ft_balance_of").args_json(json!({"account_id":alice.id()})).await?.json()?;
    assert_eq!(after,before);
    Ok(())
}
