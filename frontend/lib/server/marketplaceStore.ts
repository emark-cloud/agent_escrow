import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import { dataPath } from "./dataDir";
import { DEFAULT_NETWORK, type NetworkName } from "../config";

function marketplaceFile(network: NetworkName = DEFAULT_NETWORK) {
  return dataPath(`marketplace-${network}.json`);
}

function activityFile(network: NetworkName = DEFAULT_NETWORK) {
  return dataPath(`marketplace-activity-${network}.json`);
}

// Backwards compat: migrate old unscoped files on first read
function migrateIfNeeded(network: NetworkName) {
  const oldMp = dataPath("marketplace.json");
  const oldAct = dataPath("marketplace-activity.json");
  const newMp = marketplaceFile(network);
  const newAct = activityFile(network);
  if (network === DEFAULT_NETWORK) {
    if (existsSync(oldMp) && !existsSync(newMp)) {
      writeFileSync(newMp, readFileSync(oldMp, "utf-8"), "utf-8");
    }
    if (existsSync(oldAct) && !existsSync(newAct)) {
      writeFileSync(newAct, readFileSync(oldAct, "utf-8"), "utf-8");
    }
  }
}

export interface ServiceListing {
  id: string;
  provider_agent: string;
  provider_address: string;
  category: string;
  title: string;
  description: string;
  monitoring_url: string;
  sla_criteria: string;
  price: string;
  status: "available" | "claimed" | "completed" | "failed";
  claimed_by?: string;
  claimed_by_address?: string;
  agreement_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceEvent {
  timestamp: string;
  agent: string;
  type:
    | "listing_created"
    | "listing_claimed"
    | "deal_started"
    | "sla_check"
    | "deal_completed"
    | "deal_failed"
    | "dispute_filed";
  details: string;
}

// --- Listings ---

function readListings(network: NetworkName = DEFAULT_NETWORK): ServiceListing[] {
  migrateIfNeeded(network);
  const file = marketplaceFile(network);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as ServiceListing[];
  } catch {
    return [];
  }
}

function writeListings(data: ServiceListing[], network: NetworkName = DEFAULT_NETWORK): void {
  writeFileSync(marketplaceFile(network), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getAllListings(status?: string, network: NetworkName = DEFAULT_NETWORK): ServiceListing[] {
  const all = readListings(network);
  if (!status) return all;
  return all.filter((l) => l.status === status);
}

export function getListingById(id: string, network: NetworkName = DEFAULT_NETWORK): ServiceListing | undefined {
  return readListings(network).find((l) => l.id === id);
}

export function getListingByAgreementId(agreementId: string, network: NetworkName = DEFAULT_NETWORK): ServiceListing | undefined {
  return readListings(network).find((l) => l.agreement_id === agreementId);
}

export function createListing(listing: Omit<ServiceListing, "id" | "status" | "created_at" | "updated_at">, network: NetworkName = DEFAULT_NETWORK): ServiceListing {
  const data = readListings(network);
  const now = new Date().toISOString();
  const entry: ServiceListing = {
    ...listing,
    id: `svc-${randomBytes(4).toString("hex")}`,
    status: "available",
    created_at: now,
    updated_at: now,
  };
  data.push(entry);
  writeListings(data, network);
  return entry;
}

export function claimListing(
  id: string,
  claimedBy: string,
  claimedByAddress: string,
  agreementId: string,
  network: NetworkName = DEFAULT_NETWORK
): ServiceListing | null {
  const data = readListings(network);
  const listing = data.find((l) => l.id === id);
  if (!listing || listing.status !== "available") return null;
  listing.status = "claimed";
  listing.claimed_by = claimedBy;
  listing.claimed_by_address = claimedByAddress;
  listing.agreement_id = agreementId;
  listing.updated_at = new Date().toISOString();
  writeListings(data, network);
  return listing;
}

export function updateListingStatus(id: string, status: ServiceListing["status"], network: NetworkName = DEFAULT_NETWORK): boolean {
  const data = readListings(network);
  const listing = data.find((l) => l.id === id);
  if (!listing) return false;
  listing.status = status;
  listing.updated_at = new Date().toISOString();
  writeListings(data, network);
  return true;
}

// --- Activity Feed ---

function readActivity(network: NetworkName = DEFAULT_NETWORK): MarketplaceEvent[] {
  migrateIfNeeded(network);
  const file = activityFile(network);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as MarketplaceEvent[];
  } catch {
    return [];
  }
}

function writeActivity(data: MarketplaceEvent[], network: NetworkName = DEFAULT_NETWORK): void {
  writeFileSync(activityFile(network), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getActivity(limit = 50, network: NetworkName = DEFAULT_NETWORK): MarketplaceEvent[] {
  const all = readActivity(network);
  return all.slice(-limit);
}

export function addActivity(event: Omit<MarketplaceEvent, "timestamp">, network: NetworkName = DEFAULT_NETWORK): void {
  const data = readActivity(network);
  data.push({ ...event, timestamp: new Date().toISOString() });
  // Keep last 200 events
  if (data.length > 200) data.splice(0, data.length - 200);
  writeActivity(data, network);
}

// --- Marketplace-aware activity logging for agreement actions ---

/**
 * If the agreement is linked to a marketplace listing, log an activity event.
 * Safe to call for any agreement — silently does nothing if not marketplace-related.
 */
export function logMarketplaceActivity(
  agreementId: string,
  type: MarketplaceEvent["type"],
  details: string,
  fallbackAgent?: string,
  network: NetworkName = DEFAULT_NETWORK
): void {
  const listing = getListingByAgreementId(agreementId, network);
  if (!listing) return; // Not a marketplace agreement
  const agent = fallbackAgent || listing.claimed_by || listing.provider_agent || "unknown";
  addActivity({ agent, type, details }, network);
}

// --- Stats ---

export function getMarketplaceStats(network: NetworkName = DEFAULT_NETWORK) {
  const listings = readListings(network);
  return {
    total: listings.length,
    available: listings.filter((l) => l.status === "available").length,
    claimed: listings.filter((l) => l.status === "claimed").length,
    completed: listings.filter((l) => l.status === "completed").length,
    failed: listings.filter((l) => l.status === "failed").length,
  };
}
