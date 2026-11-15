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

// ReserveManagerHelpers: what mint() will pull and burn() will pay, to the last unit.
export const helpersAbi = parseAbi([
  'struct AssetAmount { address assetAddress; uint256 amount; }',
  'function quoteMint(uint256 mintAmount) view returns (AssetAmount[] inputAmounts, uint256 fee)',
  'function quoteBurn(uint256 burnAmount) view returns (AssetAmount[] outputAmounts, uint256 fee)',
]);

// Uniswap V4. The quoter is not a view function on-chain (it simulates the swap and reverts with the result),
// but it is only ever called with eth_call, so it is declared view here to read it like any other value.
export const v4QuoterAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) view returns (uint256 amountOut, uint256 gasEstimate)',
]);
export const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
]);

export const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  // Declared without a return value on purpose: USDT's approve returns nothing, and declaring a bool would make
  // simulations of USDT approvals fail. The app never reads this return value.
  'function approve(address spender, uint256 value)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export const routerAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
]);
export const permit2Abi = parseAbi([
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  // On-chain alternative to the signed permit, for smart-account wallets (EIP-7702 / contract wallets).
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
]);

// DFiUSD (IndexToken) reads used by the safety checks.
export const indexTokenAbi = parseAbi([
  'function getReserveManager() view returns (address)',
  'function isMigrating() view returns (bool)',
  'function isFrozen(address account) view returns (bool)',
]);
