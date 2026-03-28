import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const PROFILES_FILE = join(process.cwd(), "agent-profiles.json");

export interface AgentProfile {
  name: string;
  role: "provider" | "client" | "both";
  specialty: string;
  description: string;
  avatar_color: string;
  max_concurrent_deals: number;
}

// 5 seed agent profiles
export const SEED_PROFILES: AgentProfile[] = [
  {
    name: "Sentinel",
    role: "provider",
    specialty: "API uptime monitoring",
    description: "Specialized in monitoring API health and uptime guarantees",
    avatar_color: "#8b5cf6", // violet
    max_concurrent_deals: 3,
  },
  {
    name: "Oracle",
    role: "provider",
    specialty: "Data feed verification",
    description: "Monitors data availability and integrity for live feeds",
    avatar_color: "#06b6d4", // cyan
    max_concurrent_deals: 3,
  },
  {
    name: "Atlas",
    role: "client",
    specialty: "Infrastructure monitoring",
    description: "Needs reliable monitoring for critical infrastructure services",
    avatar_color: "#f59e0b", // amber
    max_concurrent_deals: 3,
  },
  {
    name: "Nexus",
    role: "client",
    specialty: "SLA coverage",
    description: "Seeks diverse SLA coverage across multiple service categories",
    avatar_color: "#10b981", // emerald
    max_concurrent_deals: 3,
  },
  {
    name: "Catalyst",
    role: "both",
    specialty: "Full-stack agent",
    description: "Creates and consumes monitoring services across all categories",
    avatar_color: "#ef4444", // red
    max_concurrent_deals: 4,
  },
];

function readProfiles(): AgentProfile[] {
  if (!existsSync(PROFILES_FILE)) return [];
  try {
    return JSON.parse(readFileSync(PROFILES_FILE, "utf-8")) as AgentProfile[];
  } catch {
    return [];
  }
}

function writeProfiles(data: AgentProfile[]): void {
  writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getAllProfiles(): AgentProfile[] {
  return readProfiles();
}

export function getProfile(name: string): AgentProfile | undefined {
  return readProfiles().find((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function upsertProfile(profile: AgentProfile): void {
  const data = readProfiles();
  const idx = data.findIndex((p) => p.name.toLowerCase() === profile.name.toLowerCase());
  if (idx >= 0) {
    data[idx] = profile;
  } else {
    data.push(profile);
  }
  writeProfiles(data);
}

export function seedProfiles(): AgentProfile[] {
  const existing = readProfiles();
  if (existing.length >= SEED_PROFILES.length) return existing;
  // Add any missing seed profiles
  for (const seed of SEED_PROFILES) {
    if (!existing.find((p) => p.name.toLowerCase() === seed.name.toLowerCase())) {
      existing.push(seed);
    }
  }
  writeProfiles(existing);
  return existing;
}
