//! Content preset port of Juno's 16-segment weighted curve.
//! Source: juno-wif/stylus/curve-math/src/math.rs. Whole-token units and yoctoNEAR prices.
const WAD: u128 = 1_000_000_000_000_000_000;
const CAP: u128 = 100 * WAD;
const SUPPLY: u128 = 800;
const BASE: u128 = 100_000_000_000_000_000_000;
const WEIGHTS: [u128; 16] = [
    1000000, 1200000, 1440000, 1728000, 2073600, 2488320, 2985984, 3583181,
    4299817, 5159780, 6191736, 7430084, 8916100, 10699321, 12839185, 15407022,
];
const WEIGHT_SUM: u128 = 87442130;
fn sqrt(x: u128) -> u128 {
    if x < 2 { return x; }
    let mut r = 1u128 << ((128 - x.leading_zeros() + 1) / 2);
    loop { let next=(r+x/r)/2; if next>=r{return r;} r=next; }
}
fn table() -> ([u128;17],[u128;16]) {
    let mut root=CAP;
    for _ in 0..4 { root=sqrt(root*WAD); }
    let mut prices=[0u128;17]; prices[0]=BASE;
    for i in 1..=16 {
        let p=prices[i-1]; let rem=root%WAD;
        prices[i]=p*(root/WAD)+(p/WAD)*rem+(p%WAD)*rem/WAD;
    }
    let mut sizes=[0u128;16]; let mut used=0;
    for i in 0..15 { sizes[i]=SUPPLY*WEIGHTS[i]/WEIGHT_SUM; used+=sizes[i]; }
    sizes[15]=SUPPLY-used;
    (prices,sizes)
}
fn seg_cost(p:u128,dp:u128,s:u128,a:u128,x:u128,up:bool)->u128 {
    let base=x*p;
    let numerator=dp*x*(2*a+x);
    let denominator=2*s;
    base+if up { (numerator+denominator-1)/denominator } else { numerator/denominator }
}
pub fn range_cost(sold:u128,quantity:u128,up:bool)->u128 {
    assert!(quantity>0 && sold+quantity<=SUPPLY,"ERR_QUANTITY");
    let (prices,sizes)=table();
    let from=sold; let to=sold+quantity;
    let mut start=0; let mut total=0;
    for k in 0..16 {
        if start>=to { break; }
        let end=start+sizes[k];
        if end>from && sizes[k]>0 {
            let lo=from.max(start); let hi=to.min(end);
            total+=seg_cost(prices[k],prices[k+1]-prices[k],sizes[k],lo-start,hi-lo,up);
        }
        start=end;
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn segment_table_and_round_trip() {
        let (prices,sizes)=table();
        assert_eq!(sizes.iter().sum::<u128>(),800);
        assert!(prices.windows(2).all(|w|w[1]>=w[0]));
        assert!(range_cost(0,800,true)>0);
        for sold in (0..775).step_by(25) {
            assert!(range_cost(sold,25,false)<=range_cost(sold,25,true));
        }
    }
}
