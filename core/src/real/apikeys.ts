// API keys for company servers (trd.md §6.2a). Core keeps only a SHA-256 of a key: the key is 32 random bytes, so a
// fast hash is enough and a lookup by hash is exact.
import { createHash, randomBytes } from "node:crypto";

export const hashApiKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

/** `sk_` plus 32 random bytes, base64url. */
export const newApiKey = (): string => `sk_${randomBytes(32).toString("base64url")}`;
