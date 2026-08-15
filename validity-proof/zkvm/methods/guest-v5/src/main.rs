#![no_main]

use bridge_validity_composition::{
    verify_pooled_reserve_burn_guest_witness_v5, MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V5_BYTES,
};
use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    let mut witness_len = 0u32;
    env::read_slice(core::slice::from_mut(&mut witness_len));
    let witness_len = witness_len as usize;
    assert!(witness_len <= MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V5_BYTES);

    let mut encoded_witness = vec![0u8; witness_len];
    env::read_slice(&mut encoded_witness);
    let statement = verify_pooled_reserve_burn_guest_witness_v5(&encoded_witness)
        .expect("pooled-reserve burn V5 witness must verify");
    env::commit_slice(&statement);
}
