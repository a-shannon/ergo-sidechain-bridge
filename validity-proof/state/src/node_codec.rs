// Derived from Substrate's Apache-2.0 `sp-trie` node codec at
// polkadot-sdk tag `polkadot-stable2412-6` (commit bbc435c).
// The encoding methods are intentionally unreachable because this private codec
// is used only to read externally produced state proofs.

use alloc::{borrow::Borrow, vec::Vec};
use core::{marker::PhantomData, ops::Range};

use hash_db::Hasher;
use scale_codec::{Compact, Decode, Encode, EncodeLike, Input, Output};
use thiserror::Error;
use trie_db::{
    nibble_ops,
    node::{NibbleSlicePlan, NodeHandlePlan, NodePlan, Value, ValuePlan},
    ChildReference, NodeCodec as NodeCodecT,
};

const LEAF_PREFIX_MASK: u8 = 0b_01 << 6;
const BRANCH_WITHOUT_MASK: u8 = 0b_10 << 6;
const BRANCH_WITH_MASK: u8 = 0b_11 << 6;
const EMPTY_TRIE: u8 = 0;
const ALT_HASHING_LEAF_PREFIX_MASK: u8 = 0b_1 << 5;
const ALT_HASHING_BRANCH_WITH_MASK: u8 = 0b_01 << 4;
const ESCAPE_COMPACT_HEADER: u8 = 1;
const BITMAP_LENGTH: usize = 2;

#[derive(Debug, Error)]
pub(crate) enum NodeCodecError {
    #[error("bad Substrate trie node format")]
    BadFormat,
    #[error("Substrate trie node SCALE decoding failed")]
    Decode,
}

impl From<scale_codec::Error> for NodeCodecError {
    fn from(_: scale_codec::Error) -> Self {
        Self::Decode
    }
}

struct ByteSliceInput<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> ByteSliceInput<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    fn take(&mut self, count: usize) -> Result<Range<usize>, scale_codec::Error> {
        let end = self
            .offset
            .checked_add(count)
            .ok_or_else(|| scale_codec::Error::from("node range overflow"))?;
        if end > self.data.len() {
            return Err("out of data".into());
        }
        let range = self.offset..end;
        self.offset = end;
        Ok(range)
    }
}

impl Input for ByteSliceInput<'_> {
    fn remaining_len(&mut self) -> Result<Option<usize>, scale_codec::Error> {
        Ok(Some(self.data.len().saturating_sub(self.offset)))
    }

    fn read(&mut self, into: &mut [u8]) -> Result<(), scale_codec::Error> {
        let range = self.take(into.len())?;
        into.copy_from_slice(&self.data[range]);
        Ok(())
    }

    fn read_byte(&mut self) -> Result<u8, scale_codec::Error> {
        let byte = self
            .data
            .get(self.offset)
            .copied()
            .ok_or_else(|| scale_codec::Error::from("out of data"))?;
        self.offset += 1;
        Ok(byte)
    }
}

#[derive(Default, Clone)]
pub(crate) struct SubstrateNodeCodec<H>(PhantomData<H>);

impl<H> NodeCodecT for SubstrateNodeCodec<H>
where
    H: Hasher,
{
    const ESCAPE_HEADER: Option<u8> = Some(ESCAPE_COMPACT_HEADER);
    type Error = NodeCodecError;
    type HashOut = H::Out;

    fn hashed_null_node() -> H::Out {
        H::hash(Self::empty_node())
    }

    fn decode_plan(data: &[u8]) -> Result<NodePlan, Self::Error> {
        let mut input = ByteSliceInput::new(data);
        let header = NodeHeader::decode(&mut input)?;
        let contains_hash = header.contains_hash_of_value();
        let branch_has_value = match &header {
            NodeHeader::Branch(has_value, _) => *has_value,
            _ => true,
        };

        match header {
            NodeHeader::Null => Ok(NodePlan::Empty),
            NodeHeader::HashedValueBranch(nibble_count) | NodeHeader::Branch(_, nibble_count) => {
                validate_partial_padding(data, input.offset, nibble_count)?;
                let partial = input.take(nibble_bytes(nibble_count))?;
                let partial_padding = nibble_ops::number_padding(nibble_count);
                let bitmap_range = input.take(BITMAP_LENGTH)?;
                let bitmap = Bitmap::decode(&data[bitmap_range])?;
                let value = if branch_has_value {
                    Some(if contains_hash {
                        ValuePlan::Node(input.take(H::LENGTH)?)
                    } else {
                        let count = Compact::<u32>::decode(&mut input)?.0 as usize;
                        ValuePlan::Inline(input.take(count)?)
                    })
                } else {
                    None
                };
                let mut children = [const { None }; nibble_ops::NIBBLE_LENGTH];
                for (index, child) in children.iter_mut().enumerate() {
                    if bitmap.value_at(index) {
                        let count = Compact::<u32>::decode(&mut input)?.0 as usize;
                        let range = input.take(count)?;
                        *child = Some(if count == H::LENGTH {
                            NodeHandlePlan::Hash(range)
                        } else {
                            NodeHandlePlan::Inline(range)
                        });
                    }
                }
                Ok(NodePlan::NibbledBranch {
                    partial: NibbleSlicePlan::new(partial, partial_padding),
                    value,
                    children,
                })
            }
            NodeHeader::HashedValueLeaf(nibble_count) | NodeHeader::Leaf(nibble_count) => {
                validate_partial_padding(data, input.offset, nibble_count)?;
                let partial = input.take(nibble_bytes(nibble_count))?;
                let partial_padding = nibble_ops::number_padding(nibble_count);
                let value = if contains_hash {
                    ValuePlan::Node(input.take(H::LENGTH)?)
                } else {
                    let count = Compact::<u32>::decode(&mut input)?.0 as usize;
                    ValuePlan::Inline(input.take(count)?)
                };
                Ok(NodePlan::Leaf {
                    partial: NibbleSlicePlan::new(partial, partial_padding),
                    value,
                })
            }
        }
    }

    fn is_empty_node(data: &[u8]) -> bool {
        data == Self::empty_node()
    }

    fn empty_node() -> &'static [u8] {
        &[EMPTY_TRIE]
    }

    fn leaf_node(_: impl Iterator<Item = u8>, _: usize, _: Value) -> Vec<u8> {
        unreachable!("the bridge state-proof codec is read-only")
    }

    fn extension_node(_: impl Iterator<Item = u8>, _: usize, _: ChildReference<H::Out>) -> Vec<u8> {
        unreachable!("Substrate's trie profile has no extension nodes")
    }

    fn branch_node(
        _: impl Iterator<Item = impl Borrow<Option<ChildReference<H::Out>>>>,
        _: Option<Value>,
    ) -> Vec<u8> {
        unreachable!("Substrate's trie profile uses nibbled branches")
    }

    fn branch_node_nibbled(
        _: impl Iterator<Item = u8>,
        _: usize,
        _: impl Iterator<Item = impl Borrow<Option<ChildReference<H::Out>>>>,
        _: Option<Value>,
    ) -> Vec<u8> {
        unreachable!("the bridge state-proof codec is read-only")
    }
}

fn nibble_bytes(nibble_count: usize) -> usize {
    nibble_count.div_ceil(nibble_ops::NIBBLE_PER_BYTE)
}

fn validate_partial_padding(
    data: &[u8],
    offset: usize,
    nibble_count: usize,
) -> Result<(), NodeCodecError> {
    let has_padding = nibble_count % nibble_ops::NIBBLE_PER_BYTE != 0;
    if has_padding {
        let first = data.get(offset).copied().ok_or(NodeCodecError::BadFormat)?;
        if nibble_ops::pad_left(first) != 0 {
            return Err(NodeCodecError::BadFormat);
        }
    }
    Ok(())
}

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
enum NodeHeader {
    Null,
    Branch(bool, usize),
    Leaf(usize),
    HashedValueBranch(usize),
    HashedValueLeaf(usize),
}

impl NodeHeader {
    fn contains_hash_of_value(&self) -> bool {
        matches!(self, Self::HashedValueBranch(_) | Self::HashedValueLeaf(_))
    }
}

impl Encode for NodeHeader {
    fn encode_to<T: Output + ?Sized>(&self, _: &mut T) {
        unreachable!("the bridge state-proof codec is read-only")
    }
}

impl EncodeLike for NodeHeader {}

impl Decode for NodeHeader {
    fn decode<I: Input>(input: &mut I) -> Result<Self, scale_codec::Error> {
        let first = input.read_byte()?;
        if first == EMPTY_TRIE {
            return Ok(Self::Null);
        }
        match first & (0b11 << 6) {
            LEAF_PREFIX_MASK => Ok(Self::Leaf(decode_size(first, input, 2)?)),
            BRANCH_WITH_MASK => Ok(Self::Branch(true, decode_size(first, input, 2)?)),
            BRANCH_WITHOUT_MASK => Ok(Self::Branch(false, decode_size(first, input, 2)?)),
            EMPTY_TRIE => {
                if first & (0b111 << 5) == ALT_HASHING_LEAF_PREFIX_MASK {
                    Ok(Self::HashedValueLeaf(decode_size(first, input, 3)?))
                } else if first & (0b1111 << 4) == ALT_HASHING_BRANCH_WITH_MASK {
                    Ok(Self::HashedValueBranch(decode_size(first, input, 4)?))
                } else {
                    Err("unallowed Substrate trie node encoding".into())
                }
            }
            _ => unreachable!("the two-bit node prefix exhausts every branch"),
        }
    }
}

fn decode_size(
    first: u8,
    input: &mut impl Input,
    prefix_mask: usize,
) -> Result<usize, scale_codec::Error> {
    let max_value = 255u8 >> prefix_mask;
    let mut result = (first & max_value) as usize;
    if result < max_value as usize {
        return Ok(result);
    }
    result -= 1;
    loop {
        let next = input.read_byte()? as usize;
        if next < 255 {
            return result
                .checked_add(next + 1)
                .ok_or_else(|| scale_codec::Error::from("node header size overflow"));
        }
        result = result
            .checked_add(255)
            .ok_or_else(|| scale_codec::Error::from("node header size overflow"))?;
    }
}

struct Bitmap(u16);

impl Bitmap {
    fn decode(data: &[u8]) -> Result<Self, scale_codec::Error> {
        let value = u16::decode(&mut &data[..])?;
        if value == 0 {
            Err("bitmap without a child".into())
        } else {
            Ok(Self(value))
        }
    }

    fn value_at(&self, index: usize) -> bool {
        self.0 & (1u16 << index) != 0
    }
}
