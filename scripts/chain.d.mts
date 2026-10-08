// Types for chain.mjs, so TypeScript tests can use the same helpers the scripts run.
export const CHAIN_RPC: string;
export const CORE_URL: string;
export function rpc(method: string, params?: unknown[], url?: string): Promise<unknown>;
export function waitForChain(timeoutMs?: number): Promise<unknown>;
export function runContracts(script: string): void;
export function deployAndSeed(): void;
export function syncClock(url?: string): Promise<number>;
export function clockSkew(url?: string): Promise<number>;
export function resetCore(core?: string): Promise<string | null>;
