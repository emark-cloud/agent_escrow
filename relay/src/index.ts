/**
 * AgentEscrow Bridge Relay Service
 *
 * Runs relay loops:
 * 1. GenLayer → Base: Polls GenLayer BridgeSender for verdict messages,
 *    decodes bridge format, ABI-encodes, and calls VerdictRegistry on Base Sepolia
 * 2. EVM → GenLayer: (disabled) Reverse direction relay
 */

import cron from "node-cron";
import { GenLayerToEvmRelay } from "./GenLayerToEvm.js";
import { EvmToGenLayerRelay } from "./EvmToGenLayer.js";
import {
  getBridgeSyncInterval,
  getEvmToGlSyncInterval,
  isEvmToGlBridgingEnabled,
} from "./config.js";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  AgentEscrow Bridge Relay Service");
  console.log("═══════════════════════════════════════════\n");

  // GenLayer → EVM relay (verdict bridging)
  const glToEvm = new GenLayerToEvmRelay();
  const glToEvmInterval = getBridgeSyncInterval();
  console.log(`[Relay] GL→EVM sync interval: ${glToEvmInterval}`);

  cron.schedule(glToEvmInterval, async () => {
    await glToEvm.sync();
  });

  // Initial sync
  await glToEvm.sync();

  // EVM → GenLayer relay (optional, for dispute initiation from Base)
  if (isEvmToGlBridgingEnabled()) {
    const evmToGl = new EvmToGenLayerRelay();
    const evmToGlInterval = getEvmToGlSyncInterval();
    console.log(`[Relay] EVM→GL sync interval: ${evmToGlInterval}`);

    cron.schedule(evmToGlInterval, async () => {
      await evmToGl.sync();
    });

    await evmToGl.sync();
  } else {
    console.log("[Relay] EVM→GL bridging disabled (missing config)");
  }

  console.log("\n[Relay] Service running. Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal relay error:", err);
  process.exit(1);
});
