// The gateway endpoints need the calling company's API key (trd.md §6.2a). Tests that play the SDK by hand send the
// seed company's demo key, chosen from the company the call is about.
import { API_KEY_HEADER } from "@sammati/shared";

import { TEST_COMPANIES, testApiKey } from "@sammati/test-fixtures";
export function gatewayHeaders(path: string, body?: unknown): Record<string, string> {
  if (!path.startsWith("/v1/gateway/")) return {};
  const fromQuery = new URLSearchParams(path.split("?")[1] ?? "").get("fid");
  const fromBody = typeof body === "object" && body !== null ? (body as { fiduciary?: unknown }).fiduciary : undefined;
  const address = String(fromQuery ?? fromBody ?? TEST_COMPANIES[0]!.address).toLowerCase();
  const company = TEST_COMPANIES.find((f) => f.address.toLowerCase() === address) ?? TEST_COMPANIES[0]!;
  return { [API_KEY_HEADER]: testApiKey(company.slug) };
}
