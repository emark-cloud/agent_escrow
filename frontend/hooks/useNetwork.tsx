"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  type NetworkName,
  type NetworkConfig,
  getNetworkConfig,
  getGenlayerChain,
} from "@/lib/config";
import { getProvider } from "@/lib/provider";

interface NetworkContextType {
  network: NetworkName;
  config: NetworkConfig;
  switchNetwork: (network: NetworkName) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

const STORAGE_KEY = "agentescrow_network";

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkName>("bradbury");

  // Sync from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "studionet" || saved === "bradbury") {
      setNetwork(saved);
      // Ensure cookie is in sync so server-side API routes pick up the right network
      document.cookie = `agentescrow_network=${saved};path=/;max-age=31536000`;
    }
  }, []);

  const switchNetwork = useCallback(async (newNetwork: NetworkName) => {
    const chain = getGenlayerChain(newNetwork);

    // Try to switch MetaMask chain
    const provider = getProvider();
    if (provider) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chain.chainId }],
        });
      } catch (e: unknown) {
        const code = (e as { code?: number })?.code;
        if (code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [chain],
          });
        } else if (code === 4001) {
          // User rejected — don't switch
          return;
        }
      }
    }

    setNetwork(newNetwork);
    localStorage.setItem(STORAGE_KEY, newNetwork);
    document.cookie = `agentescrow_network=${newNetwork};path=/;max-age=31536000`;
  }, []);

  const config = getNetworkConfig(network);

  return (
    <NetworkContext.Provider value={{ network, config, switchNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
