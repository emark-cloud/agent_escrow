"use client";
import {
  createElement,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getGenlayerChain } from "@/lib/config";
import { useNetwork } from "@/hooks/useNetwork";
import {
  getProvider,
  setProvider,
  clearProvider,
  hasProvider,
  detectWallets,
  getSavedWalletRdns,
  type DetectedWallet,
} from "@/lib/provider";

interface WalletState {
  address: string | null;
  connecting: boolean;
  isConnected: boolean;
  wrongNetwork: boolean;
  showModal: boolean;
  wallets: DetectedWallet[];
  openModal: () => void;
  closeModal: () => void;
  connectWallet: (wallet: DetectedWallet) => Promise<void>;
  switchNetwork: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { network } = useNetwork();
  const genlayerChain = getGenlayerChain(network);
  const expectedChainId = parseInt(genlayerChain.chainId, 16);

  function isCorrectChain(chainId: string): boolean {
    return parseInt(chainId, 16) === expectedChainId;
  }

  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);

  const openModal = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    }
    setTimeout(() => {
      const detected = detectWallets();
      if (detected.length === 0 && typeof window !== "undefined" && window.ethereum) {
        detected.push({
          info: {
            name: (window.ethereum as any).isMetaMask ? "MetaMask" : "Browser Wallet",
            icon: "",
            uuid: "legacy",
            rdns: "legacy",
          },
          provider: window.ethereum,
        });
      }
      setWallets(detected);
      setShowModal(true);
    }, 100);
  }, []);

  const closeModal = useCallback(() => setShowModal(false), []);

  const connectWallet = useCallback(async (wallet: DetectedWallet) => {
    setProvider(wallet.provider, wallet.info.rdns);
    setShowModal(false);
    setConnecting(true);

    const provider = wallet.provider;
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: genlayerChain.chainId }],
        });
      } catch (switchError: any) {
        if (switchError?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [genlayerChain],
          });
        } else {
          throw switchError;
        }
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      setAddress(accounts[0] || null);
      setWrongNetwork(false);
    } catch (err) {
      console.error("Failed to connect:", err);
      clearProvider();
    } finally {
      setConnecting(false);
    }
  }, [genlayerChain]);

  const switchNetwork = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: genlayerChain.chainId }],
      });
    } catch (switchError: any) {
      if (switchError?.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [genlayerChain],
        });
      }
    }
  }, [genlayerChain]);

  const disconnect = useCallback(() => {
    clearProvider();
    setAddress(null);
    setWrongNetwork(false);
  }, []);

  // Restore wallet from localStorage on mount
  useEffect(() => {
    const savedRdns = getSavedWalletRdns();
    if (!savedRdns || hasProvider()) return;

    // Wait briefly for EIP-6963 wallets to announce
    const timer = setTimeout(() => {
      const wallets = detectWallets();
      const match = wallets.find((w) => w.info.rdns === savedRdns);
      if (!match) {
        // Also try legacy fallback
        if (savedRdns === "legacy" && typeof window !== "undefined" && window.ethereum) {
          setProvider(window.ethereum, "legacy");
        } else {
          return;
        }
      } else {
        setProvider(match.provider, match.info.rdns);
      }

      // Silently check if still authorized (don't prompt)
      const provider = getProvider();
      if (!provider) return;
      provider
        .request({ method: "eth_accounts" })
        .then((accounts: unknown) => {
          const accs = accounts as string[];
          if (accs.length > 0) {
            setAddress(accs[0]);
          } else {
            // Wallet locked or revoked — clear saved state
            clearProvider();
          }
        })
        .catch(() => {
          clearProvider();
        });
    }, 150);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for account/chain changes only when user has explicitly connected
  useEffect(() => {
    if (!hasProvider()) return;
    const provider = getProvider();
    if (!provider) return;

    // Re-check accounts (e.g. after page refresh with provider still set)
    provider
      .request({ method: "eth_accounts" })
      .then((accounts: unknown) => {
        const accs = accounts as string[];
        if (accs.length > 0) setAddress(accs[0]);
      })
      .catch(() => {});

    provider
      .request({ method: "eth_chainId" })
      .then((chainId: unknown) => {
        setWrongNetwork(!isCorrectChain(chainId as string));
      })
      .catch(() => {});

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        // Wallet locked or disconnected from its side
        clearProvider();
        setAddress(null);
        setWrongNetwork(false);
      } else {
        setAddress(accounts[0]);
      }
    };
    const handleChainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string;
      setWrongNetwork(!isCorrectChain(chainId));
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider?.removeListener("accountsChanged", handleAccountsChanged);
      provider?.removeListener("chainChanged", handleChainChanged);
    };
  }, [address, expectedChainId]); // eslint-disable-line react-hooks/exhaustive-deps

  return createElement(
    WalletContext.Provider,
    {
      value: {
        address,
        connecting,
        isConnected: !!address,
        wrongNetwork,
        showModal,
        wallets,
        openModal,
        closeModal,
        connectWallet,
        switchNetwork,
        disconnect,
      },
    },
    children
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
