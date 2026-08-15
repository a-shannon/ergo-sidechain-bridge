#![no_main]

use bridge_validity_composition::{
    verify_bridge_validity_guest_witness_v1, MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES,
};
use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    let mut witness_len = 0u32;
    env::read_slice(core::slice::from_mut(&mut witness_len));
    let witness_len = witness_len as usize;
    assert!(witness_len <= MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES);

    let mut encoded_witness = vec![0u8; witness_len];
    env::read_slice(&mut encoded_witness);
    let statement = verify_bridge_validity_guest_witness_v1(&encoded_witness)
        .expect("bridge validity witness must verify");
    env::commit_slice(&statement);
}
