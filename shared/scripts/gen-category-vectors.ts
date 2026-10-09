// Regenerates test-vectors/data-categories.json (trd.md §4.6). The Dart copy of the registry in
// wallet/lib/core/data_categories.dart must pass the same file. All values are made up.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORY_GROUPS,
  DATA_CATEGORIES,
  isValidFieldValue,
  missingFields,
  normalizeCategories,
  profilePayload,
  type Profile,
} from "../src/categories";

const TODAY = "2026-10-09";

const checks: [string, string][] = [
  ["fullName", "Asha Rao"], ["fullName", "A"], ["fullName", " Asha"], ["fullName", "ಆಶಾ ರಾವ್"], ["fullName", "x".repeat(81)],
  ["dob", "1995-12-31"], ["dob", "2026-10-09"], ["dob", "2026-10-10"], ["dob", "1899-12-31"], ["dob", "1995-02-30"], ["dob", "31/12/1995"],
  ["gender", "female"], ["gender", "prefer_not_to_say"], ["gender", "Female"],
  ["mobile", "9876501234"], ["mobile", "5876501234"], ["mobile", "98765012"], ["mobile", "+919876501234"],
  ["email", "asha@example.com"], ["email", "asha@example"], ["email", "asha example@x.com"], ["email", "a@b.co"],
  ["address", "12 MG Road, Bengaluru"], ["address", "Home"],
  ["pan", "ABCDE1234F"], ["pan", "abcde1234f"], ["pan", "ABCDE12345"],
  ["incomeBand", "6-9 LPA"], ["incomeBand", "6 to 9 LPA"],
  ["employment", "salaried"], ["employment", "Salaried"],
  ["employer", "Acme Pvt Ltd"], ["employer", "A"],
  ["bloodGroup", "O+"], ["bloodGroup", "AB-"], ["bloodGroup", "C+"],
  ["allergies", "Peanuts"], ["allergies", "x"],
  ["insurancePolicy", "POL-2024-0099"], ["insurancePolicy", "ab"], ["insurancePolicy", "POL 2024"],
  ["foodPreference", "vegetarian"], ["foodPreference", "veg"],
  ["deliveryAddress", "Flat 4B, 2nd Cross, Mysuru"], ["deliveryAddress", "abc"],
];

const full: Profile = {
  fullName: "Asha Rao", dob: "1995-12-31", gender: "female", mobile: "9876501234", email: "asha@example.com",
  address: "12 MG Road, Bengaluru", pan: "ABCDE1234F", incomeBand: "6-9 LPA", employment: "salaried", employer: "Acme Pvt Ltd",
  bloodGroup: "O+", allergies: "Peanuts", insurancePolicy: "POL-2024-0099", foodPreference: "vegetarian",
  deliveryAddress: "Flat 4B, 2nd Cross, Mysuru",
};
const loan = ["financial.pan", "financial.income_band", "financial.employment"];
const payloadCases = [
  { name: "loan purpose, full profile", profile: full, categories: loan },
  { name: "loan purpose, income missing", profile: { pan: "ABCDE1234F", employment: "salaried" }, categories: loan },
  { name: "categories out of order and repeated", profile: full, categories: ["contact.mobile", "identity.name", "contact.mobile"] },
  { name: "empty values count as missing", profile: { fullName: "", mobile: "9876501234" }, categories: ["identity.name", "contact.mobile"] },
  { name: "a category the registry does not know", profile: full, categories: ["identity.name", "loyalty.card"] },
  { name: "empty profile", profile: {}, categories: ["health.blood_group"] },
].map((c) => ({ ...c, payload: profilePayload(c.profile, c.categories), missing: missingFields(c.profile, c.categories) }));

const out = {
  groups: CATEGORY_GROUPS,
  categories: DATA_CATEGORIES,
  validation: { today: TODAY, cases: checks.map(([field, value]) => ({ field, value, valid: isValidFieldValue(field, value, TODAY) })) },
  normalize: [
    ["financial.pan", "identity.name", "financial.pan"],
    ["prefs.delivery_address", "contact.email", "identity.dob"],
    ["a.unknown", "identity.name"],
  ].map((input) => ({ input, output: normalizeCategories(input) })),
  payload: payloadCases,
};

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../test-vectors/data-categories.json");
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${file}`);
