export interface WalletInfo {
  name: string;
  icon: string;
  uuid: string;
  rdns: string;
}

export interface DetectedWallet {
  info: WalletInfo;
  provider: any;
}

const STORAGE_KEY = "agentescrow_wallet_rdns";

// Selected provider stored globally so all modules use the same wallet
let selectedProvider: any = null;

/** Get all wallets announced via EIP-6963 */
export function detectWallets(): DetectedWallet[] {
  return [...eip6963Wallets];
}

// EIP-6963 wallet accumulator
const eip6963Wallets: DetectedWallet[] = [];

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", ((event: any) => {
    const { info, provider } = event.detail;
    // Deduplicate by uuid
    if (!eip6963Wallets.some((w) => w.info.uuid === info.uuid)) {
      eip6963Wallets.push({ info, provider });
    }
  }) as EventListener);

  // Request wallets to announce themselves
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** Set the active wallet provider and persist choice */
export function setProvider(provider: any, rdns?: string) {
  selectedProvider = provider;
  if (rdns) {
    try { localStorage.setItem(STORAGE_KEY, rdns); } catch {}
  }
}

/** Clear the active wallet provider and forget choice */
export function clearProvider() {
  selectedProvider = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Whether the user has explicitly selected a wallet */
export function hasProvider(): boolean {
  return selectedProvider !== null;
}

/** Get the persisted wallet rdns (if any) */
export function getSavedWalletRdns(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/**
 * Get the currently selected wallet provider.
 * Only returns a provider if the user explicitly connected — no window.ethereum fallback.
 */
export function getProvider(): typeof window.ethereum {
  if (selectedProvider) return selectedProvider;
  return undefined as unknown as typeof window.ethereum;
}
