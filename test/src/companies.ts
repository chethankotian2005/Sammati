// Throwaway companies for tests (X-01). Nothing here ships: the app registers no company. Identities are Hardhat's
// public accounts #1 to #8 (account #0 is the test customer and the chain's admin).
import type { LocalizedText } from "@sammati/shared";

export interface TestPurpose {
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  dataCategories: string[];
  retentionDays: number; // placeholder values: the spec fixes none
  sharesThirdParty: boolean;
  required: boolean;
}

export interface TestProcessor {
  name: string;
  address: string;
  /** Hardhat's public test key for this account. */
  demoKey: string;
  purposeCode: string;
}

export interface TestCompany {
  slug: "quickloan" | "medicare" | "foodrush";
  name: string;
  address: string;
  /** Hardhat's public test key for this account. */
  demoKey: string;
  sector: string;
  color: string;
  port: number;
  purposes: TestPurpose[];
  processors: TestProcessor[];
}

function text(en: string): LocalizedText {
  return { en, hi: `${en} (hi)`, kn: `${en} (kn)` };
}

function purpose(
  code: string,
  title: string,
  description: string,
  dataCategories: string[],
  retentionDays: number,
  sharesThirdParty: boolean,
  required = false,
): TestPurpose {
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

export const TEST_COMPANIES: readonly TestCompany[] = [
  {
    slug: "quickloan",
    name: "QuickLoan",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    demoKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    sector: "Fintech lending",
    color: "#2F5BEA",
    port: 4101,
    purposes: [
      purpose("credit_check", "Credit check", "Check your credit eligibility", ["financial.pan", "financial.income_band", "financial.employment"], 365, false),
      purpose("marketing", "Loan offers", "Send you loan offers", ["contact.mobile", "contact.email"], 180, true),
      purpose("bureau_share", "Credit bureau sharing", "Share repayment history with credit bureaus", ["financial.income_band"], 1095, true),
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
      purpose("treatment", "Treatment", "Use your records for your treatment", ["health.blood_group", "health.allergies"], 3650, false, true),
      purpose("insurance_claim", "Insurance claims", "Share records with your insurer for claims", ["health.insurance_policy", "identity.name"], 730, true),
      purpose("research", "Medical research", "Use anonymised data for medical research", ["health.blood_group"], 1825, true),
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
      purpose("delivery", "Delivery", "Use your location to deliver orders", ["prefs.delivery_address"], 30, false, true),
      purpose("ad_targeting", "Personalised ads", "Personalise ads from your order history", ["prefs.food"], 180, true),
      purpose("partner_share", "Restaurant partners", "Share your orders with restaurant partners", ["prefs.food"], 90, true),
    ],
    processors: [{ name: "AdNetworkZ", address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", demoKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", purposeCode: "ad_targeting" }],
  },
];

/** The API key a test gives a test company (the real keys are generated at approval and shown once). */
export const testApiKey = (slug: string): string => `sk_test_${slug}`;

/** Hardhat account #0: the test customer. A real phone generates its own key. */
export const TEST_CUSTOMER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const TEST_CUSTOMER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** A throwaway profile with made-up values; the e2e searches the whole run for the PAN. */
export const TEST_PROFILE = { employment: "salaried", incomeBand: "6-9 LPA", pan: "ABCDE1234F", score: 742 } as const;
