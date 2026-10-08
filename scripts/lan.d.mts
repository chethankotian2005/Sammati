export interface LanAddress {
  name: string;
  address: string;
  score: number;
}
export interface InterfaceAddress {
  address: string;
  family: string | number;
  internal: boolean;
}
type Interfaces = Record<string, InterfaceAddress[] | undefined>;
export function lanAddresses(interfaces?: Interfaces): LanAddress[];
export function pickLanAddress(interfaces?: Interfaces): string | null;
export function describeQrUrl(options: {
  port: string | number;
  env?: Record<string, string | undefined>;
  interfaces?: Interfaces;
}): { url: string; source: "env" | "detected" | "none"; candidates: LanAddress[]; banner: string };
