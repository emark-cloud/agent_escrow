"use client";
import { useWallet } from "@/hooks/useWallet";

export function ConnectWallet() {
  const {
    address,
    connecting,
    isConnected,
    wrongNetwork,
    showModal,
    wallets,
    openModal,
    closeModal,
    connectWallet,
    switchNetwork,
    disconnect,
  } = useWallet();

  return (
    <>
      {isConnected && address ? (
        <div className="flex items-center gap-3">
          {wrongNetwork && (
            <button
              onClick={switchNetwork}
              className="px-3 py-1.5 text-xs bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 hover:bg-yellow-500/30 transition-colors"
            >
              Wrong Network — Switch
            </button>
          )}
          <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg border border-white/20">
            <div
              className={`w-2 h-2 rounded-full ${wrongNetwork ? "bg-yellow-400" : "bg-green-400"}`}
            />
            <span className="text-sm font-mono text-white/80">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <button
              onClick={disconnect}
              className="ml-1 text-white/30 hover:text-white/70 transition-colors"
              title="Disconnect"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={openModal}
          disabled={connecting}
          className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}

      {/* Wallet Selection Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                Connect Wallet
              </h2>
              <button
                onClick={closeModal}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {wallets.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/50 text-sm mb-3">
                  No wallets detected
                </p>
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 text-sm underline"
                >
                  Install MetaMask
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.info.uuid}
                    onClick={() => connectWallet(wallet)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all text-left"
                  >
                    {wallet.info.icon ? (
                      <img
                        src={wallet.info.icon}
                        alt={wallet.info.name}
                        className="w-8 h-8 rounded-lg"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/50 text-xs font-bold">
                        {wallet.info.name[0]}
                      </div>
                    )}
                    <span className="text-sm font-medium text-white">
                      {wallet.info.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
