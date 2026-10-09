// Constants every package shares. Nothing here describes a company or a customer.

/** Purposes whose data the wallet can send to the Processor (ui.md V2). */
export const VAULT_PURPOSES: readonly string[] = ["credit_check"];
export const PROCESSOR_PORT = 4200;
/** The income bands and employment statuses the loan rules know (trd.md §6.7, §6.10). */
export const INCOME_BANDS = ["0-3 LPA", "3-6 LPA", "6-9 LPA", "9+ LPA"] as const;
export const EMPLOYMENT_STATUSES = ["salaried", "self-employed", "student", "unemployed"] as const;

/**
 * The relayer's key on the local chain, keccak256("sammati-demo-relayer"). Public on purpose: it only ever holds
 * test ETH on a local node, and Core refuses it on a public network (trd.md §6.6). It is not a Hardhat account, so
 * `pnpm seed` funds it from the admin, as a real deployment would.
 */
export const LOCAL_RELAYER_KEY = "0xfbe32bfa0c2ff2102e9a5f0cc05b7d469749f75ee21bdca151642f85525b2ecf";
export const LOCAL_RELAYER_ADDRESS = "0xf448D3bbB6B8F2d1780215F8a1137B896d69Be60";

/** Hardhat account #0's public key: the admin (and regulator's chain account) on the local chain. Core refuses it on a public network. */
export const LOCAL_ADMIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
/** The chain id of the local Hardhat node. */
export const LOCAL_CHAIN_ID = 31337;
