import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const TX_FILE = join(process.cwd(), "tx-activity.json");

export interface ActiveTx {
  agreementId: string;
  action: string;
  txHash: string;
  glTxId?: string;
  wallet: string;
  startedAt: number;
}

type TxMap = Record<string, ActiveTx>;

function readFile(): TxMap {
  if (!existsSync(TX_FILE)) return {};
  try {
    const raw = readFileSync(TX_FILE, "utf-8");
    return JSON.parse(raw) as TxMap;
  } catch {
    return {};
  }
}

function writeFile(data: TxMap): void {
  writeFileSync(TX_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Key is agreementId:action to allow one active tx per action per agreement */
function makeKey(agreementId: string, action: string): string {
  return `${agreementId}:${action}`;
}

export function addActiveTx(tx: ActiveTx): void {
  const data = readFile();
  data[makeKey(tx.agreementId, tx.action)] = tx;
  writeFile(data);
}

export function removeActiveTx(agreementId: string, action: string): void {
  const data = readFile();
  delete data[makeKey(agreementId, action)];
  writeFile(data);
}

export function getActiveTxsForAgreement(agreementId: string): ActiveTx[] {
  const data = readFile();
  const results: ActiveTx[] = [];
  for (const tx of Object.values(data)) {
    if (tx.agreementId === agreementId) {
      // Auto-expire after 10 minutes
      if (Date.now() - tx.startedAt > 10 * 60 * 1000) continue;
      results.push(tx);
    }
  }
  return results;
}
