// Demo seed (drd.md §5). Fiduciary and processor identities are Hardhat's
// public accounts #1 to #8 (account #0 is the demo principal): a disclosed demo
// shortcut, the keys are held by Core (trd.md §12).
// hi/kn strings are placeholders until the native-speaker copy pass.
import type { LocalizedText } from "./types";

export interface SeedPurpose {
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  dataCategories: string[];
  retentionDays: number; // placeholder values: the spec fixes none
  sharesThirdParty: boolean;
  required: boolean;
}

export interface SeedProcessor {
  name: string;
  address: string;
  /** Hardhat's public test key for this account. Core signs the processor's acknowledgements with it: a disclosed demo shortcut (demo.md). */
  demoKey: string;
  purposeCode: string;
}

export interface SeedFiduciary {
  slug: "quickloan" | "medicare" | "foodrush";
  name: string;
  address: string;
  /** Hardhat's public test key for this account. Core signs the company's anchor transactions with it: a disclosed demo shortcut (trd.md §12). */
  demoKey: string;
  sector: string;
  color: string; // ui.md company identity colours
  port: number;
  purposes: SeedPurpose[];
  processors: SeedProcessor[];
}

function text(en: string): LocalizedText {
  return { en, hi: `[hi] ${en}`, kn: `[kn] ${en}` };
}

function purpose(
  code: string,
  title: string,
  description: string,
  dataCategories: string[],
  retentionDays: number,
  sharesThirdParty: boolean,
  required = false,
): SeedPurpose {
  return {
    code,
    title: text(title),
    description: text(description),
    dataCategories,
    retentionDays,
    sharesThirdParty,
    required,
  };
}

export const SEED_FIDUCIARIES: readonly SeedFiduciary[] = [
  {
    slug: "quickloan",
    name: "QuickLoan",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    demoKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    sector: "Fintech lending",
    color: "#2F5BEA",
    port: 4101,
    purposes: [
      purpose("credit_check", "Credit check", "Check your credit eligibility", ["PAN", "income", "12 months of statements"], 365, false),
      purpose("marketing", "Loan offers", "Send you loan offers", ["phone", "email"], 180, true),
      purpose("bureau_share", "Credit bureau sharing", "Share repayment history with credit bureaus", ["repayment history"], 1095, true),
    ],
    processors: [
      { name: "CreditBureauX", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", demoKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", purposeCode: "bureau_share" },
      { name: "AdPartnerQ", address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", demoKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", purposeCode: "marketing" },
    ],
  },
  {
    slug: "medicare",
    name: "MediCare+",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    demoKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    sector: "Health",
    color: "#0E9AA7",
    port: 4102,
    purposes: [
      purpose("treatment", "Treatment", "Use your records for your treatment", ["medical records"], 3650, false, true),
      purpose("insurance_claim", "Insurance claims", "Share records with your insurer for claims", ["medical records", "billing"], 730, true),
      purpose("research", "Medical research", "Use anonymised data for medical research", ["anonymised records"], 1825, true),
    ],
    processors: [
      { name: "InsureCo", address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", demoKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e", purposeCode: "insurance_claim" },
      { name: "ResearchLab", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", demoKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", purposeCode: "research" },
    ],
  },
  {
    slug: "foodrush",
    name: "FoodRush",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    demoKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    sector: "Food delivery",
    color: "#E4572E",
    port: 4103,
    purposes: [
      purpose("delivery", "Delivery", "Use your location to deliver orders", ["location"], 30, false, true),
      purpose("ad_targeting", "Personalised ads", "Personalise ads from your order history", ["order history"], 180, true),
      purpose("partner_share", "Restaurant partners", "Share your orders with restaurant partners", ["order history"], 90, true),
    ],
    processors: [{ name: "AdNetworkZ", address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", demoKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", purposeCode: "ad_targeting" }],
  },
];

/** Where a purpose is guarded in its company's backend. */
export interface GuardedEndpoint {
  /** Express path; `:id` is the company-side customer id. */
  path: string;
}

/**
 * The endpoint Core's /v1/demo/fire calls for each purpose. The company apps (`companies/*`) own the
 * routes and their fictional data (drd.md §5) and register them with the gateway SDK; this map only
 * says where to knock. A test (core/test/companies.test.ts) fails if a company stops serving one of
 * these, so the two cannot drift apart unnoticed. Purpose codes are unique across the companies.
 */
export const GUARDED_ENDPOINTS: Readonly<Record<string, GuardedEndpoint>> = {
  credit_check: { path: "/customers/:id/credit-profile" },
  marketing: { path: "/marketing/campaign/sms" },
  bureau_share: { path: "/bureau/sync" },
  treatment: { path: "/patients/:id/records" },
  insurance_claim: { path: "/claims/file" },
  research: { path: "/research/export" },
  delivery: { path: "/customers/:id/profile" },
  ad_targeting: { path: "/ads/recommendations" },
  partner_share: { path: "/orders/partner-dispatch" },
};

/** Company-side customer id used by the simulator; the real id never leaves the company (drd.md §1). */
export const SIMULATOR_CUSTOMER_ID = "1";
/**
 * Demo relayer key, keccak256("sammati-demo-relayer"). Public on purpose: it only ever holds
 * test ETH, and Core holds it for the demo (trd.md §12). Not a Hardhat account, so the seed has
 * to fund it, as a real deployment would.
 */
export const DEMO_RELAYER_KEY = "0xfbe32bfa0c2ff2102e9a5f0cc05b7d469749f75ee21bdca151642f85525b2ecf";
export const DEMO_RELAYER_ADDRESS = "0xf448D3bbB6B8F2d1780215F8a1137B896d69Be60";

/** Hardhat account #0; the real phone generates its own key (drd.md §5). */
export const DEMO_PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";