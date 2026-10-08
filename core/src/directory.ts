import type { Hex, LocalizedText } from "@sammati/shared";

/** A purpose as Core serves it: what a company declared at registration (trd.md §6.12). */
export interface DirectoryPurpose {
  id: Hex;
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  dataCategories: string[];
  retentionDays: number;
  sharesThirdParty: boolean;
  required: boolean;
}
