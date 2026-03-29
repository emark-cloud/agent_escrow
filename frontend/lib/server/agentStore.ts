import { readFileSync, writeFileSync, existsSync } from "fs";
import { dataPath } from "./dataDir";

const AGENTS_FILE = dataPath("agents.json");

type AgentMap = Record<string, string>;

function readFile(): AgentMap {
  if (!existsSync(AGENTS_FILE)) return {};
  try {
    const raw = readFileSync(AGENTS_FILE, "utf-8");
    return JSON.parse(raw) as AgentMap;
  } catch {
    return {};
  }
}

function writeFile(data: AgentMap): void {
  writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getAllAgents(): AgentMap {
  return readFile();
}

export function addAgent(name: string, privateKey: string): void {
  const data = readFile();
  data[name] = privateKey;
  writeFile(data);
}

export function removeAgent(name: string): boolean {
  const data = readFile();
  if (!(name in data)) return false;
  delete data[name];
  writeFile(data);
  return true;
}
