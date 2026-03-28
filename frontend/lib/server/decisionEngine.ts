import { type AgentProfile, getProfile } from "./agentProfiles";
import { getAllListings, type ServiceListing } from "./marketplaceStore";
import { pickRandomTemplate, type ServiceTemplate } from "./serviceCatalog";

export interface AgentDecision {
  action: "create_listing" | "claim_listing" | "wait";
  listing?: {
    category: string;
    title: string;
    description: string;
    monitoring_url: string;
    sla_criteria: string;
    price: string;
    expected: "pass" | "fail";
  };
  listing_id?: string;
  reasoning: string;
}

// Category preferences per specialty
const SPECIALTY_CATEGORIES: Record<string, string[]> = {
  "API uptime monitoring": ["api-health", "uptime"],
  "Data feed verification": ["data-feed", "api-health"],
  "Infrastructure monitoring": ["uptime", "api-health", "performance"],
  "SLA coverage": ["data-feed", "api-health", "uptime", "performance"],
  "Full-stack agent": ["api-health", "data-feed", "uptime", "performance"],
};

function getPreferredCategories(profile: AgentProfile): string[] {
  return SPECIALTY_CATEGORIES[profile.specialty] || ["api-health", "uptime"];
}

function countActiveDeals(agentName: string, listings: ServiceListing[]): number {
  return listings.filter(
    (l) =>
      l.status === "claimed" &&
      (l.provider_agent.toLowerCase() === agentName.toLowerCase() ||
        l.claimed_by?.toLowerCase() === agentName.toLowerCase())
  ).length;
}

function countOwnAvailableListings(agentName: string, listings: ServiceListing[]): number {
  return listings.filter(
    (l) =>
      l.status === "available" &&
      l.provider_agent.toLowerCase() === agentName.toLowerCase()
  ).length;
}

export function decide(agentName: string): AgentDecision {
  const profile = getProfile(agentName);
  if (!profile) {
    return { action: "wait", reasoning: `Unknown agent: ${agentName}` };
  }

  const allListings = getAllListings();
  const activeDeals = countActiveDeals(agentName, allListings);

  // At capacity — wait
  if (activeDeals >= profile.max_concurrent_deals) {
    return {
      action: "wait",
      reasoning: `At max capacity (${activeDeals}/${profile.max_concurrent_deals} active deals)`,
    };
  }

  // If agent has active deals, prioritize completing them over new marketplace actions
  if (activeDeals > 0) {
    return {
      action: "wait",
      reasoning: `Focusing on ${activeDeals} active deal(s) before taking new marketplace actions`,
    };
  }

  const canProvide = profile.role === "provider" || profile.role === "both";
  const canConsume = profile.role === "client" || profile.role === "both";
  const preferredCats = getPreferredCategories(profile);

  // Only create a listing if agent has no unclaimed listings already
  const ownListings = countOwnAvailableListings(agentName, allListings);
  const shouldProvide = canProvide && ownListings === 0 && (!canConsume || Math.random() < 0.5);

  // Try to create a listing
  if (shouldProvide) {
    // Pick from a preferred category
    const cat = preferredCats[Math.floor(Math.random() * preferredCats.length)];
    const template = pickRandomTemplate(cat);
    return {
      action: "create_listing",
      listing: {
        category: template.category,
        title: template.title,
        description: template.description,
        monitoring_url: template.monitoring_url,
        sla_criteria: template.sla_criteria,
        price: template.price,
        expected: template.expected,
      },
      reasoning: `Provider creating listing in ${cat} (${ownListings} own available, ${activeDeals} active deals)`,
    };
  }

  // Try to claim an available listing (clients)
  if (canConsume) {
    const available = allListings.filter(
      (l) =>
        l.status === "available" &&
        l.provider_agent.toLowerCase() !== agentName.toLowerCase()
    );

    if (available.length === 0) {
      return {
        action: "wait",
        reasoning: "No available listings from other agents to claim",
      };
    }

    // Prefer listings in agent's specialty categories
    const preferred = available.filter((l) => preferredCats.includes(l.category));
    const pool = preferred.length > 0 ? preferred : available;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    return {
      action: "claim_listing",
      listing_id: pick.id,
      reasoning: `Claiming "${pick.title}" from ${pick.provider_agent} (${pick.category}, ${pick.price} GEN)`,
    };
  }

  return { action: "wait", reasoning: "No actionable items right now" };
}
