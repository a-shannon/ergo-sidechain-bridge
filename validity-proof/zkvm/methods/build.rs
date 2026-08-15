fn main() {
    if cfg!(windows) {
        panic!("build the zkVM workspace in the pinned Linux guest-builder container");
    }

    // The host clippy wrapper cannot compile the guest against the RISC Zero sysroot.
    std::env::remove_var("RUSTC_WRAPPER");
    std::env::remove_var("RUSTC_WORKSPACE_WRAPPER");
    risc0_build::embed_methods();
}
