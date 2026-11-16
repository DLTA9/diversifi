// The "accept the terms" step (client decision, 15 Nov 2026): everyone may use the app except US persons and other
// Prohibited Persons as defined in the Terms. No KYC, wallet screening or geo-blocking; the person confirms it themselves.
// Acceptance is remembered per wallet in this browser. Bump TERMS_VERSION whenever the Terms change, so everyone
// is asked again.
export const TERMS_VERSION = '2025-09';
const key = (address: string) => `dfi-terms-${TERMS_VERSION}:${address.toLowerCase()}`;

export function hasAccepted(address: string): boolean {
  try { return !!window.localStorage.getItem(key(address)); } catch { return false; }
}

export function rememberAcceptance(address: string) {
  try { window.localStorage.setItem(key(address), new Date().toISOString()); } catch { /* private mode: asked again next visit */ }
}
