export const BRIDGE_ABI = Object.freeze([
  'function owner() external view returns (address)',
  'function sergToken() external view returns (address)',
  'function latestErgoHeight() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'function processedPegIns(bytes32) external view returns (bool)',
  'function totalSERGSupply() external view returns (uint256)',
  'function bridgeSERGBalance() external view returns (uint256)',
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
  'event PegIn(address indexed to, uint256 amount, bytes32 ergoBoxId)',
] as const);

export const SERG_ABI = Object.freeze([
  'function owner() external view returns (address)',
  'function balanceOf(address account) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function decimals() external pure returns (uint8)',
] as const);
