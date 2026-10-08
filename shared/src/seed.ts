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
  purposeCode: string;
}

export interface SeedFiduciary {
  slug: "quickloan" | "medicare" | "foodrush";
  name: string;
  address: string;
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
    sector: "Fintech lending",
    color: "#2F5BEA",
    port: 4101,
    purposes: [
      purpose("credit_check", "Credit check", "Check your credit eligibility", ["PAN", "income", "12 months of statements"], 365, false),
      purpose("marketing", "Loan offers", "Send you loan offers", ["phone", "email"], 180, true),
      purpose("bureau_share", "Credit bureau sharing", "Share repayment history with credit bureaus", ["repayment history"], 1095, true),
    ],
    processors: [
      { name: "CreditBureauX", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", purposeCode: "bureau_share" },
      { name: "AdPartnerQ", address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", purposeCode: "marketing" },
    ],
  },
  {
    slug: "medicare",
    name: "MediCare+",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    sector: "Health",
    color: "#0E9AA7",
    port: 4102,
    purposes: [
      purpose("treatment", "Treatment", "Use your records for your treatment", ["medical records"], 3650, false, true),
      purpose("insurance_claim", "Insurance claims", "Share records with your insurer for claims", ["medical records", "billing"], 730, true),
      purpose("research", "Medical research", "Use anonymised data for medical research", ["anonymised records"], 1825, true),
    ],
    processors: [
      { name: "InsureCo", address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", purposeCode: "insurance_claim" },
      { name: "ResearchLab", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", purposeCode: "research" },
    ],
  },
  {
    slug: "foodrush",
    name: "FoodRush",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    sector: "Food delivery",
    color: "#E4572E",
    port: 4103,
    purposes: [
      purpose("delivery", "Delivery", "Use your location to deliver orders", ["location"], 30, false, true),
      purpose("ad_targeting", "Personalised ads", "Personalise ads from your order history", ["order history"], 180, true),
      purpose("partner_share", "Restaurant partners", "Share your orders with restaurant partners", ["order history"], 90, true),
    ],
    processors: [{ name: "AdNetworkZ", address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", purposeCode: "ad_targeting" }],
  },
];

/** Hardhat account #0; the real phone generates its own key (drd.md §5). */
export const DEMO_PRINCIPAL = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";