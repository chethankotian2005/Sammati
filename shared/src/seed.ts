// Demo seed (drd.md §5). Addresses are not here: Core derives fiduciary and
// processor keys at seed time (disclosed demo shortcut, trd.md §12).
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
  purposeCode: string;
}

export interface SeedFiduciary {
  slug: "quickloan" | "medicare" | "foodrush";
  name: string;
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
    sector: "Fintech lending",
    color: "#2F5BEA",
    port: 4101,
    purposes: [
      purpose("credit_check", "Credit check", "Check your credit eligibility", ["PAN", "income", "12 months of statements"], 365, false),
      purpose("marketing", "Loan offers", "Send you loan offers", ["phone", "email"], 180, true),
      purpose("bureau_share", "Credit bureau sharing", "Share repayment history with credit bureaus", ["repayment history"], 1095, true),
    ],
    processors: [
      { name: "CreditBureauX", purposeCode: "bureau_share" },
      { name: "AdPartnerQ", purposeCode: "marketing" },
    ],
  },
  {
    slug: "medicare",
    name: "MediCare+",
    sector: "Health",
    color: "#0E9AA7",
    port: 4102,
    purposes: [
      purpose("treatment", "Treatment", "Use your records for your treatment", ["medical records"], 3650, false, true),
      purpose("insurance_claim", "Insurance claims", "Share records with your insurer for claims", ["medical records", "billing"], 730, true),
      purpose("research", "Medical research", "Use anonymised data for medical research", ["anonymised records"], 1825, true),
    ],
    processors: [
      { name: "InsureCo", purposeCode: "insurance_claim" },
      { name: "ResearchLab", purposeCode: "research" },
    ],
  },
  {
    slug: "foodrush",
    name: "FoodRush",
    sector: "Food delivery",
    color: "#E4572E",
    port: 4103,
    purposes: [
      purpose("delivery", "Delivery", "Use your location to deliver orders", ["location"], 30, false, true),
      purpose("ad_targeting", "Personalised ads", "Personalise ads from your order history", ["order history"], 180, true),
      purpose("partner_share", "Restaurant partners", "Share your orders with restaurant partners", ["order history"], 90, true),
    ],
    processors: [{ name: "AdNetworkZ", purposeCode: "ad_targeting" }],
  },
];
