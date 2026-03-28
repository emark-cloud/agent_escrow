// Curated pool of realistic service templates for the autonomous marketplace.
// Mix of ~70% expected-pass and ~30% expected-fail to generate both happy paths and disputes.

export interface ServiceTemplate {
  title: string;
  category: string;
  description: string;
  monitoring_url: string;
  sla_criteria: string;
  price: string;
  expected: "pass" | "fail";
}

export const SERVICE_CATALOG: ServiceTemplate[] = [
  // === EXPECTED PASS (~70%) ===
  {
    title: "GitHub API Health Monitor",
    category: "api-health",
    description: "Monitor GitHub REST API availability and response format",
    monitoring_url: "https://api.github.com",
    sla_criteria: "Response returns HTTP 200 and body is valid JSON",
    price: "100",
    expected: "pass",
  },
  {
    title: "Google DNS Resolution Check",
    category: "data-feed",
    description: "Verify Google public DNS resolver is responding correctly",
    monitoring_url: "https://dns.google/resolve?name=google.com",
    sla_criteria: "Response returns HTTP 200 and JSON body contains a Status field",
    price: "120",
    expected: "pass",
  },
  {
    title: "JSONPlaceholder API Monitor",
    category: "api-health",
    description: "Monitor JSONPlaceholder test API for availability",
    monitoring_url: "https://jsonplaceholder.typicode.com/posts/1",
    sla_criteria: "Response returns HTTP 200 and JSON body contains a title field",
    price: "80",
    expected: "pass",
  },
  {
    title: "httpbin Service Check",
    category: "uptime",
    description: "Verify httpbin.org test service is responding",
    monitoring_url: "https://httpbin.org/get",
    sla_criteria: "Response returns HTTP 200 and body contains an origin field",
    price: "90",
    expected: "pass",
  },
  {
    title: "CoinGecko Price Feed",
    category: "data-feed",
    description: "Monitor CoinGecko cryptocurrency API availability",
    monitoring_url: "https://api.coingecko.com/api/v3/ping",
    sla_criteria: "Response returns HTTP 200 and JSON body contains gecko_says field",
    price: "150",
    expected: "pass",
  },
  {
    title: "GitHub User Endpoint",
    category: "api-health",
    description: "Monitor GitHub user API endpoint availability",
    monitoring_url: "https://api.github.com/users/octocat",
    sla_criteria: "Response returns HTTP 200 and JSON contains a login field",
    price: "110",
    expected: "pass",
  },
  {
    title: "httpbin Headers Inspector",
    category: "api-health",
    description: "Verify httpbin headers endpoint is functional",
    monitoring_url: "https://httpbin.org/headers",
    sla_criteria: "Response returns HTTP 200 and JSON body contains a headers object",
    price: "75",
    expected: "pass",
  },
  {
    title: "DummyJSON Products API",
    category: "data-feed",
    description: "Monitor DummyJSON product catalog API",
    monitoring_url: "https://dummyjson.com/products/1",
    sla_criteria: "Response returns HTTP 200 and JSON contains a title and price field",
    price: "95",
    expected: "pass",
  },
  {
    title: "ipify IP Detection",
    category: "uptime",
    description: "Monitor ipify public IP detection service",
    monitoring_url: "https://api.ipify.org?format=json",
    sla_criteria: "Response returns HTTP 200 and JSON body contains an ip field",
    price: "60",
    expected: "pass",
  },
  {
    title: "Cat Facts API",
    category: "data-feed",
    description: "Monitor Cat Facts fun data API availability",
    monitoring_url: "https://catfact.ninja/fact",
    sla_criteria: "Response returns HTTP 200 and JSON body contains a fact field",
    price: "50",
    expected: "pass",
  },
  {
    title: "JSONPlaceholder Comments Feed",
    category: "data-feed",
    description: "Monitor JSONPlaceholder comments endpoint",
    monitoring_url: "https://jsonplaceholder.typicode.com/comments/1",
    sla_criteria: "Response returns HTTP 200 and JSON contains an email field",
    price: "85",
    expected: "pass",
  },
  // === EXPECTED FAIL (~30%) ===
  {
    title: "Impossible Latency SLA",
    category: "performance",
    description: "Ultra-strict latency requirement on GitHub API",
    monitoring_url: "https://api.github.com",
    sla_criteria: "Response must contain a field called quantum_ready set to true and response time must be under 1 nanosecond",
    price: "200",
    expected: "fail",
  },
  {
    title: "Nonexistent Service Monitor",
    category: "uptime",
    description: "Monitor a service endpoint that does not exist",
    monitoring_url: "https://thisservicedoesnotexist.invalid",
    sla_criteria: "Response returns HTTP 200 and body contains operational status",
    price: "175",
    expected: "fail",
  },
  {
    title: "Blockchain Verification Check",
    category: "api-health",
    description: "Require blockchain verification field from standard API",
    monitoring_url: "https://api.github.com",
    sla_criteria: "Response must contain a blockchain_verified field set to true",
    price: "250",
    expected: "fail",
  },
  {
    title: "Strict XML Response Check",
    category: "api-health",
    description: "Require XML format from a JSON-only API",
    monitoring_url: "https://httpbin.org/get",
    sla_criteria: "Response must be valid XML with a root element called response",
    price: "180",
    expected: "fail",
  },
  {
    title: "Impossible Uptime Guarantee",
    category: "performance",
    description: "Require AI-generated content from a static API",
    monitoring_url: "https://jsonplaceholder.typicode.com/posts/1",
    sla_criteria: "Response must contain a field called ai_confidence with value above 0.99",
    price: "300",
    expected: "fail",
  },
];

// Pick a random template, optionally filtered by category
export function pickRandomTemplate(category?: string): ServiceTemplate {
  const filtered = category
    ? SERVICE_CATALOG.filter((t) => t.category === category)
    : SERVICE_CATALOG;
  const pool = filtered.length > 0 ? filtered : SERVICE_CATALOG;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Get all unique categories
export function getCategories(): string[] {
  return [...new Set(SERVICE_CATALOG.map((t) => t.category))];
}
