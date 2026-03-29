/**
 * Authorize the relay wallet on the GenLayer BridgeReceiver contract.
 *
 * Usage:
 *   OWNER_KEY=0x... npx tsx deploy/authorize-relayer.ts
 *
 * Or if genlayer account is unlocked, export key first:
 *   genlayer account export --name emark
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url.replace("/deploy/authorize-relayer.ts", "/frontend/"));
const { createClient, createAccount } = require("genlayer-js");
const { testnetBradbury } = require("genlayer-js/chains");

const BRIDGE_RECEIVER = "0x47e4FcAb492C3Ad56196f972A993E113535542CF";
const RELAY_WALLET = "0xE9818d6F6b1d3574fCD0Badf43c0F91806DdF408";

async function main() {
  const ownerKey = process.env.OWNER_KEY;
  if (!ownerKey) {
    console.error("Set OWNER_KEY=0x... (the private key that deployed BridgeReceiver)");
    process.exit(1);
  }

  // createAccount expects key with 0x prefix (viem format)
  const key = ownerKey.startsWith("0x") ? ownerKey : `0x${ownerKey}`;
  const account = createAccount(key as `0x${string}`);
  console.log("Owner address:", account.address);

  const client = createClient({ chain: testnetBradbury, account });

  console.log(`\nAuthorizing relay ${RELAY_WALLET} on BridgeReceiver ${BRIDGE_RECEIVER}...`);

  try {
    const txHash = await client.writeContract({
      address: BRIDGE_RECEIVER as `0x${string}`,
      functionName: "set_authorized_relayer",
      args: [RELAY_WALLET, true],
    });

    console.log("TX hash:", txHash);
    console.log("Waiting for receipt...");

    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    console.log("Status:", receipt.status);
    console.log("Done!");
  } catch (err: unknown) {
    console.error("Error:", err);
  }
}

main();
