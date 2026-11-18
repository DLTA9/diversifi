import { parseAbi } from 'viem';

// Read-only fragments of the Sourcify-verified ReserveManagerV1 ABI, for the live reserve figures.
export const reserveManagerAbi = parseAbi([
  'struct AssetParams { address assetAddress; uint88 targetAllocation; uint8 decimals; }',
  'function getCurrentAssetParams() view returns (AssetParams[])',
  'function getTargetAssetParams() view returns (AssetParams[])',
  'function getSpecificReservesScaled(address asset) view returns (uint256)',
  'function getTotalReservesScaled() view returns (uint256)',
  'function getMintFeeQ96() view returns (uint256)',
  'function getCompoundingMintFeeQ96() view returns (uint256)',
  'function getBurnFeeQ96() view returns (uint256)',
  'function getIsMintEnabled() view returns (bool)',
  'function getMaxReserves() view returns (uint256)',
  'function getEqualizationBounty() view returns (uint256)',
  'function getTotalReservesDiscrepencyScaled() view returns (uint256)',
  'function getIndexToken() view returns (address)',
  'function isEmigrating() view returns (bool)',
]);
