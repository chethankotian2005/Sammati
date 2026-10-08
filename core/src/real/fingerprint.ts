import type { Chain } from "./chain";
import type { Repo } from "./repo";

/** indexer_state key; survives clearChainDerived, which would otherwise forget which chain it was describing. */
export const FINGERPRINT_KEY = "chain_fingerprint";

/**
 * An identity for "this chain, with these contracts deployed on it": the genesis block hash plus the hash
 * of the block the registry was deployed in.
 *
 * Genesis alone is not enough. A node restart gives a new genesis (its timestamp is the start time),
 * but `hardhat_reset` keeps the genesis and only rewinds the blocks after it. The deployment block's
 * hash covers that case: it commits to the deploy transaction and its timestamp, so a redeploy after a
 * reset produces a different block.
 */
export async function chainFingerprint(chain: Chain): Promise<string> {
  const [genesis, deployed] = await Promise.all([
    chain.provider.getBlock(0),
    chain.provider.getBlock(chain.deployment.startBlock ?? 1),
  ]);
  return `${genesis?.hash ?? "no-genesis"}:${deployed?.hash ?? "no-deploy-block"}`;
}

export function storedFingerprint(repo: Repo): string | undefined {
  return repo.getState(FINGERPRINT_KEY);
}
