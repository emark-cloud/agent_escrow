"use client";
import { useNetwork } from "@/hooks/useNetwork";
import type { NetworkName } from "@/lib/config";

const networks: { name: NetworkName; label: string }[] = [
  { name: "bradbury", label: "Bradbury" },
  { name: "studionet", label: "StudioNet" },
];

export default function NetworkSwitcher() {
  const { network, switchNetwork } = useNetwork();

  return (
    <div className="flex items-center rounded-lg bg-zinc-800 p-0.5 text-xs">
      {networks.map((n) => (
        <button
          key={n.name}
          onClick={() => switchNetwork(n.name)}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            network === n.name
              ? "bg-violet-600 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
