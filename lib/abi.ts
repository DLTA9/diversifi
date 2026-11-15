import { parseAbi } from 'viem';

// Fragments of the Sourcify-verified ABIs for ReserveManagerV1 and IndexToken (DFiUSD).
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
  'function mint(uint256 _mintAmount, bytes _forwardData)',
  'function burn(uint256 _burnAmount, bool _unsafe, bytes _forwardData)',
  // Rebalancing: deposit (+delta) or withdraw (−delta) one coin, only toward its target share. Pays the reward pool share.
  'function swapTowardsTarget(address _asset, int256 _delta) returns (uint256 reserveTransfer, uint256 indexTransfer)',
  'function getEqualizationBounty() view returns (uint256)',
  'function getTotalReservesDiscrepencyScaled() view returns (uint256)',
  'function getIndexToken() view returns (address)',
  'function isEmigrating() view returns (bool)',
]);

export const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
]);

// DFiUSD (IndexToken) reads used by the safety checks.
export const indexTokenAbi = parseAbi([
  'function getReserveManager() view returns (address)',
  'function isMigrating() view returns (bool)',
  'function isFrozen(address account) view returns (bool)',
]);
