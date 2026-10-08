import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AnchorBatchView,
  CascadeItem,
  Hex,
  LedgerEventView,
  LocalizedText,
  PrincipalConsentsResponse,
  StoredAccessLogEntry,
} from "@sammati/shared";

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

export interface DirectoryProcessor {
  name: string;
  address: Hex;
  purposeId: Hex;
}

export interface DirectoryFiduciary {
  slug: string;
  name: string;
  sector: string;
  color: string;
  address: Hex;
  purposes: DirectoryPurpose[];
  processors: DirectoryProcessor[];
}

export interface DirectoryFile {
  chainId: number;
  verifyingContract: Hex;
  noticeVersion: number;
  demoPrincipal: Hex;
  fiduciaries: DirectoryFiduciary[];
}

export interface Fixtures {
  directory: DirectoryFile;
  consents: PrincipalConsentsResponse;
  access: Record<Hex, StoredAccessLogEntry[]>;
  anchors: Record<Hex, AnchorBatchView[]>;
  ledger: LedgerEventView[];
  /** Keyed `${principal}|${purposeId}`. */
  cascade: Record<string, CascadeItem[]>;
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(dir, name), "utf8")) as T;

/** Fresh copy on every call, so the store can mutate without touching other instances. */
export function loadFixtures(): Fixtures {
  return {
    directory: read("directory.json"),
    consents: read("consents.json"),
    access: read("access.json"),
    anchors: read("anchors.json"),
    ledger: read("ledger.json"),
    cascade: read("cascade.json"),
  };
}
