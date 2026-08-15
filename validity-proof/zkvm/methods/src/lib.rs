//! Reproducibly built RISC Zero method binaries and image identities.

/// Frozen V1 compatibility `ProgramBinary` reproduced from the exact source lineage in
/// `artifacts/bridge-validity-guest-v1.manifest`.
pub const BRIDGE_VALIDITY_GUEST_ELF: &[u8] =
    include_bytes!("../artifacts/bridge-validity-guest-v1.bin");
/// Frozen V1 compatibility image ID. New method families must not reinterpret it.
pub const BRIDGE_VALIDITY_GUEST_ID: [u32; 8] = [
    247_416_411,
    2_476_081_138,
    2_629_025_575,
    3_839_542_378,
    261_771_405,
    2_650_313_167,
    1_873_970_383,
    876_159_044,
];

/// Frozen V2 application-bound `ProgramBinary` reproduced from the exact source lineage in
/// `artifacts/bridge-validity-guest-v2.manifest`.
pub const BRIDGE_VALIDITY_GUEST_V2_ELF: &[u8] =
    include_bytes!("../artifacts/bridge-validity-guest-v2.bin");
/// Frozen V2 application-bound image ID. New method families must not reinterpret it.
pub const BRIDGE_VALIDITY_GUEST_V2_ID: [u32; 8] = [
    2_384_858_147,
    3_777_152_458,
    151_564_891,
    776_360_234,
    96_092_200,
    3_323_208_256,
    186_899_167,
    739_376_799,
];

/// Frozen V4 pooled-reserve `ProgramBinary` reproduced from the exact source lineage in
/// `artifacts/bridge-validity-guest-v4.manifest` after verifier-profile reuse correction.
pub const BRIDGE_VALIDITY_GUEST_V4_ELF: &[u8] =
    include_bytes!("../artifacts/bridge-validity-guest-v4.bin");
/// Frozen V4 pooled-reserve image ID. Application semantics remain distinct from the reusable
/// EIP-0045 verifier-profile identity.
pub const BRIDGE_VALIDITY_GUEST_V4_ID: [u32; 8] = [
    2_061_077_165,
    1_493_173_834,
    1_064_898_279,
    489_753_281,
    3_774_551_582,
    3_202_120_795,
    2_544_208_565,
    3_829_336_998,
];

/// Frozen V5 Sudo-absent `ProgramBinary` reproduced from the exact source lineage in
/// `artifacts/bridge-validity-guest-v5.manifest`.
pub const BRIDGE_VALIDITY_GUEST_V5_ELF: &[u8] =
    include_bytes!("../artifacts/bridge-validity-guest-v5.bin");
/// Frozen V5 Sudo-absent image ID. It is a distinct application statement family while reusing
/// the exact V4 verifier-profile identity.
pub const BRIDGE_VALIDITY_GUEST_V5_ID: [u32; 8] = [
    552_956_605,
    4_064_669_072,
    4_133_959_552,
    1_129_176_652,
    1_601_419_028,
    1_507_125_287,
    2_142_457_196,
    824_886_557,
];

#[cfg(test)]
const HISTORICAL_V4_DRAFT_ID: [u32; 8] = [
    1_673_768_046,
    216_070_969,
    984_699_074,
    3_224_857_038,
    678_175_374,
    2_028_072_078,
    533_424_513,
    3_001_174_869,
];

#[cfg(test)]
mod generated_v5 {
    include!(concat!(env!("OUT_DIR"), "/methods.rs"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest as _, Sha256};

    #[test]
    fn frozen_v1_manifest_and_program_binary_recompute_to_the_compatibility_identity() {
        assert_eq!(
            include_str!("../artifacts/bridge-validity-guest-v1.manifest"),
            concat!(
                "schema=e2s.bridge-validity-guest-compatibility-artifact.v1\n",
                "version=1\n",
                "source_commit=614611cae5b670f56d7d1ea9e7821b9ee280a836\n",
                "source_tree=9b2727892c28bdb7c42b237185dcc590a85de5e4\n",
                "risc0_source_commit=8eb06ab020a92dc5b63ba6dd0836d432aba6d890\n",
                "guest_rust_toolchain=1.88.0\n",
                "image_id=5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934\n",
                "program_binary_bytes=769516\n",
                "program_binary_sha256=17a1cdf1884e3518dbdf860ebd39134a2498d86cdc695cff43e73544b2eac89d\n",
            )
        );
        assert_eq!(BRIDGE_VALIDITY_GUEST_ELF.len(), 769_516);
        assert_eq!(
            <[u8; 32]>::from(Sha256::digest(BRIDGE_VALIDITY_GUEST_ELF)),
            [
                0x17, 0xa1, 0xcd, 0xf1, 0x88, 0x4e, 0x35, 0x18, 0xdb, 0xdf, 0x86, 0x0e, 0xbd, 0x39,
                0x13, 0x4a, 0x24, 0x98, 0xd8, 0x6c, 0xdc, 0x69, 0x5c, 0xff, 0x43, 0xe7, 0x35, 0x44,
                0xb2, 0xea, 0xc8, 0x9d,
            ]
        );
        let image_id = risc0_binfmt::compute_image_id(BRIDGE_VALIDITY_GUEST_ELF)
            .expect("frozen V1 compatibility ProgramBinary must decode");
        assert_eq!(image_id.as_words(), BRIDGE_VALIDITY_GUEST_ID);
    }

    #[test]
    fn frozen_v2_manifest_and_program_binary_recompute_to_the_application_identity() {
        assert_eq!(
            include_str!("../artifacts/bridge-validity-guest-v2.manifest"),
            concat!(
                "schema=e2s.bridge-validity-guest-compatibility-artifact.v1\n",
                "version=2\n",
                "source_commit=20e7e8dfeac235ebd468a07b8b3695a21cdcbbd6\n",
                "source_tree=8cc95cc1f97efab3a790b608094e52d9f3ff9864\n",
                "risc0_source_commit=8eb06ab020a92dc5b63ba6dd0836d432aba6d890\n",
                "guest_rust_toolchain=1.88.0\n",
                "image_id=230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c\n",
                "program_binary_bytes=799732\n",
                "program_binary_sha256=ebebb29eb24847bb481cb159b1ab29219a503ad62104c5fc41816084db762a39\n",
            )
        );
        assert_eq!(BRIDGE_VALIDITY_GUEST_V2_ELF.len(), 799_732);
        assert_eq!(
            <[u8; 32]>::from(Sha256::digest(BRIDGE_VALIDITY_GUEST_V2_ELF)),
            [
                0xeb, 0xeb, 0xb2, 0x9e, 0xb2, 0x48, 0x47, 0xbb, 0x48, 0x1c, 0xb1, 0x59, 0xb1, 0xab,
                0x29, 0x21, 0x9a, 0x50, 0x3a, 0xd6, 0x21, 0x04, 0xc5, 0xfc, 0x41, 0x81, 0x60, 0x84,
                0xdb, 0x76, 0x2a, 0x39,
            ]
        );
        let image_id = risc0_binfmt::compute_image_id(BRIDGE_VALIDITY_GUEST_V2_ELF)
            .expect("frozen V2 application ProgramBinary must decode");
        assert_eq!(image_id.as_words(), BRIDGE_VALIDITY_GUEST_V2_ID);
        assert_ne!(BRIDGE_VALIDITY_GUEST_V2_ID, BRIDGE_VALIDITY_GUEST_ID);
    }

    #[test]
    fn corrected_v4_manifest_and_program_binary_remain_frozen() {
        assert_eq!(
            include_str!("../artifacts/bridge-validity-guest-v4.manifest"),
            concat!(
                "schema=e2s.bridge-validity-guest-program-artifact.v1\n",
                "version=4\n",
                "source_commit=f90205c1a0c7f414bcaeee7077c60b3e97f01010\n",
                "source_tree=431df2c8dc097de2fcf4c1c0b355b7887d0d8782\n",
                "risc0_source_commit=8eb06ab020a92dc5b63ba6dd0836d432aba6d890\n",
                "guest_rust_toolchain=1.88.0\n",
                "image_id=ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4\n",
                "program_binary_bytes=805528\n",
                "program_binary_sha256=f521d2df0d53b5d7be9146ccfe2548295b97069385fb7eef3b4ba3adafd75e77\n",
            )
        );
        assert_eq!(BRIDGE_VALIDITY_GUEST_V4_ELF.len(), 805_528);
        assert_eq!(
            <[u8; 32]>::from(Sha256::digest(BRIDGE_VALIDITY_GUEST_V4_ELF)),
            [
                0xf5, 0x21, 0xd2, 0xdf, 0x0d, 0x53, 0xb5, 0xd7, 0xbe, 0x91, 0x46, 0xcc, 0xfe, 0x25,
                0x48, 0x29, 0x5b, 0x97, 0x06, 0x93, 0x85, 0xfb, 0x7e, 0xef, 0x3b, 0x4b, 0xa3, 0xad,
                0xaf, 0xd7, 0x5e, 0x77,
            ]
        );
        let image_id = risc0_binfmt::compute_image_id(BRIDGE_VALIDITY_GUEST_V4_ELF)
            .expect("frozen V4 pooled-reserve ProgramBinary must decode");
        assert_eq!(image_id.as_words(), BRIDGE_VALIDITY_GUEST_V4_ID);
        assert_eq!(
            image_id.as_bytes(),
            &[
                0xad, 0x8a, 0xd9, 0x7a, 0x4a, 0x06, 0x00, 0x59, 0xe7, 0x0e, 0x79, 0x3f, 0xc1, 0x0a,
                0x31, 0x1d, 0x1e, 0x16, 0xfb, 0xe0, 0x5b, 0x7c, 0xdc, 0xbe, 0xb5, 0x8a, 0xa5, 0x97,
                0xa6, 0x0b, 0x3f, 0xe4,
            ]
        );
        assert_ne!(BRIDGE_VALIDITY_GUEST_V4_ID, HISTORICAL_V4_DRAFT_ID);
        assert_ne!(BRIDGE_VALIDITY_GUEST_V4_ID, BRIDGE_VALIDITY_GUEST_ID);
        assert_ne!(BRIDGE_VALIDITY_GUEST_V4_ID, BRIDGE_VALIDITY_GUEST_V2_ID);
    }

    #[test]
    fn frozen_v5_manifest_and_program_binary_match_the_generated_method() {
        assert_eq!(
            include_str!("../artifacts/bridge-validity-guest-v5.manifest"),
            concat!(
                "schema=e2s.bridge-validity-guest-program-artifact.v1\n",
                "version=5\n",
                "source_commit=36f990f6a1fc207e90570a726b38a5168651e31e\n",
                "source_tree=5ff2b8baeac6232904e7357edb41e117a396ce02\n",
                "risc0_source_commit=8eb06ab020a92dc5b63ba6dd0836d432aba6d890\n",
                "guest_rust_toolchain=1.88.0\n",
                "image_id=bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31\n",
                "program_binary_bytes=805024\n",
                "program_binary_sha256=ada19a67444b6808fa8d3c9e4f6ea4ceca7c5fa168ba26f93f6f31684efe215c\n",
            )
        );
        assert_eq!(BRIDGE_VALIDITY_GUEST_V5_ELF.len(), 805_024);
        assert_eq!(
            <[u8; 32]>::from(Sha256::digest(BRIDGE_VALIDITY_GUEST_V5_ELF)),
            [
                0xad, 0xa1, 0x9a, 0x67, 0x44, 0x4b, 0x68, 0x08, 0xfa, 0x8d, 0x3c, 0x9e, 0x4f, 0x6e,
                0xa4, 0xce, 0xca, 0x7c, 0x5f, 0xa1, 0x68, 0xba, 0x26, 0xf9, 0x3f, 0x6f, 0x31, 0x68,
                0x4e, 0xfe, 0x21, 0x5c,
            ]
        );
        let image_id = risc0_binfmt::compute_image_id(BRIDGE_VALIDITY_GUEST_V5_ELF)
            .expect("frozen V5 Sudo-absent ProgramBinary must decode");
        assert_eq!(image_id.as_words(), BRIDGE_VALIDITY_GUEST_V5_ID);
        assert_eq!(
            image_id.as_bytes(),
            &[
                0xbd, 0x72, 0xf5, 0x20, 0x90, 0xed, 0x45, 0xf2, 0x80, 0x37, 0x67, 0xf6, 0x4c, 0xde,
                0x4d, 0x43, 0x14, 0xb7, 0x73, 0x5f, 0x27, 0xe8, 0xd4, 0x59, 0x6c, 0x4d, 0xb3, 0x7f,
                0x1d, 0xc5, 0x2a, 0x31,
            ]
        );
        assert!(
            generated_v5::BRIDGE_VALIDITY_GUEST_V5_PATH.ends_with("/bridge-validity-guest-v5.bin")
        );
        assert_eq!(
            generated_v5::BRIDGE_VALIDITY_GUEST_V5_ELF,
            BRIDGE_VALIDITY_GUEST_V5_ELF
        );
        assert_eq!(
            generated_v5::BRIDGE_VALIDITY_GUEST_V5_ID,
            BRIDGE_VALIDITY_GUEST_V5_ID
        );
        assert_ne!(BRIDGE_VALIDITY_GUEST_V5_ID, BRIDGE_VALIDITY_GUEST_ID);
        assert_ne!(BRIDGE_VALIDITY_GUEST_V5_ID, BRIDGE_VALIDITY_GUEST_V2_ID);
        assert_ne!(BRIDGE_VALIDITY_GUEST_V5_ID, BRIDGE_VALIDITY_GUEST_V4_ID);
    }
}
