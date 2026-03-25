import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const COURT_FILE = join(process.cwd(), "court-deployments.json");

interface CourtDeployment {
  agreementId: string;
  milestoneIndex: number;
  courtAddress: string;
  deployedBy: string;
  deployedAt: number;
}

type CourtMap = Record<string, CourtDeployment>;

function makeKey(agreementId: string, milestoneIndex: number): string {
  return `${agreementId}:${milestoneIndex}`;
}

function readFile(): CourtMap {
  if (!existsSync(COURT_FILE)) return {};
  try {
    return JSON.parse(readFileSync(COURT_FILE, "utf-8")) as CourtMap;
  } catch {
    return {};
  }
}

function writeFile(data: CourtMap): void {
  writeFileSync(COURT_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function saveCourtDeployment(
  agreementId: string,
  milestoneIndex: number,
  courtAddress: string,
  deployedBy: string,
): void {
  const data = readFile();
  data[makeKey(agreementId, milestoneIndex)] = {
    agreementId,
    milestoneIndex,
    courtAddress,
    deployedBy,
    deployedAt: Date.now(),
  };
  writeFile(data);
}

export function getCourtAddress(
  agreementId: string,
  milestoneIndex: number,
): string | null {
  const data = readFile();
  return data[makeKey(agreementId, milestoneIndex)]?.courtAddress ?? null;
}

export function getCourtDeployments(agreementId: string): CourtDeployment[] {
  const data = readFile();
  return Object.values(data).filter((d) => d.agreementId === agreementId);
}
