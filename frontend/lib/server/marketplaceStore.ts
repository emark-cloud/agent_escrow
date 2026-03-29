import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import { dataPath } from "./dataDir";

const MARKETPLACE_FILE = dataPath("marketplace.json");
const ACTIVITY_FILE = dataPath("marketplace-activity.json");

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

function readListings(): ServiceListing[] {
  if (!existsSync(MARKETPLACE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(MARKETPLACE_FILE, "utf-8")) as ServiceListing[];
  } catch {
    return [];
  }
}

function writeListings(data: ServiceListing[]): void {
  writeFileSync(MARKETPLACE_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getAllListings(status?: string): ServiceListing[] {
  const all = readListings();
  if (!status) return all;
  return all.filter((l) => l.status === status);
}

export function getListingById(id: string): ServiceListing | undefined {
  return readListings().find((l) => l.id === id);
}

export function getListingByAgreementId(agreementId: string): ServiceListing | undefined {
  return readListings().find((l) => l.agreement_id === agreementId);
}

export function createListing(listing: Omit<ServiceListing, "id" | "status" | "created_at" | "updated_at">): ServiceListing {
  const data = readListings();
  const now = new Date().toISOString();
  const entry: ServiceListing = {
    ...listing,
    id: `svc-${randomBytes(4).toString("hex")}`,
    status: "available",
    created_at: now,
    updated_at: now,
  };
  data.push(entry);
  writeListings(data);
  return entry;
}

export function claimListing(
  id: string,
  claimedBy: string,
  claimedByAddress: string,
  agreementId: string
): ServiceListing | null {
  const data = readListings();
  const listing = data.find((l) => l.id === id);
  if (!listing || listing.status !== "available") return null;
  listing.status = "claimed";
  listing.claimed_by = claimedBy;
  listing.claimed_by_address = claimedByAddress;
  listing.agreement_id = agreementId;
  listing.updated_at = new Date().toISOString();
  writeListings(data);
  return listing;
}

export function updateListingStatus(id: string, status: ServiceListing["status"]): boolean {
  const data = readListings();
  const listing = data.find((l) => l.id === id);
  if (!listing) return false;
  listing.status = status;
  listing.updated_at = new Date().toISOString();
  writeListings(data);
  return true;
}

// --- Activity Feed ---

function readActivity(): MarketplaceEvent[] {
  if (!existsSync(ACTIVITY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ACTIVITY_FILE, "utf-8")) as MarketplaceEvent[];
  } catch {
    return [];
  }
}

function writeActivity(data: MarketplaceEvent[]): void {
  writeFileSync(ACTIVITY_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getActivity(limit = 50): MarketplaceEvent[] {
  const all = readActivity();
  return all.slice(-limit);
}

export function addActivity(event: Omit<MarketplaceEvent, "timestamp">): void {
  const data = readActivity();
  data.push({ ...event, timestamp: new Date().toISOString() });
  // Keep last 200 events
  if (data.length > 200) data.splice(0, data.length - 200);
  writeActivity(data);
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
  fallbackAgent?: string
): void {
  const listing = getListingByAgreementId(agreementId);
  if (!listing) return; // Not a marketplace agreement
  const agent = fallbackAgent || listing.claimed_by || listing.provider_agent || "unknown";
  addActivity({ agent, type, details });
}

// --- Stats ---

export function getMarketplaceStats() {
  const listings = readListings();
  return {
    total: listings.length,
    available: listings.filter((l) => l.status === "available").length,
    claimed: listings.filter((l) => l.status === "claimed").length,
    completed: listings.filter((l) => l.status === "completed").length,
    failed: listings.filter((l) => l.status === "failed").length,
  };
}
