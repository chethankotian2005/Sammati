import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clockSkew, rpc, syncClock } from "../../scripts/chain.mjs";
import { startTestChain, type TestChain } from "./harness";

// The Auditor compares ledger time with the gateway's wall-clock log entries, so the demo chain has to
// track real time. Without this, `hardhat_reset` leaves the chain behind by the node's age (minutes,
// growing with every dev:reset) and the scorecard reports violations that never happened.
const TOLERANCE_SECONDS = 2;

let chain: TestChain;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const burst = async (n: number) => {
  for (let i = 0; i < n; i++) await rpc("evm_mine", [], chain.rpc);
};

beforeAll(async () => {
  chain = await startTestChain();
});

afterAll(async () => {
  await chain?.stop();
});

describe("chain clock vs wall clock", () => {
  it("is on the wall clock at node start", async () => {
    await syncClock(chain.rpc);
    expect(Math.abs(await clockSkew(chain.rpc))).toBeLessThan(TOLERANCE_SECONDS);
  });

  it("falls behind after hardhat_reset if nothing puts it right (the bug), and is back within 2 s once synced", async () => {
    await sleep(3500); // the node is older than the tolerance now, which is exactly what makes a reset lag
    await rpc("hardhat_reset", [], chain.rpc);
    await rpc("evm_mine", [], chain.rpc);
    expect(await clockSkew(chain.rpc)).toBeLessThan(-TOLERANCE_SECONDS);

    const skew = await syncClock(chain.rpc);
    expect(Math.abs(skew)).toBeLessThan(TOLERANCE_SECONDS);
    expect(Math.abs(await clockSkew(chain.rpc))).toBeLessThan(TOLERANCE_SECONDS);
  });

  it("stays within 2 s after a burst of 25 blocks, and keeps tracking as time passes", async () => {
    await burst(25);
    expect(Math.abs(await clockSkew(chain.rpc))).toBeLessThan(TOLERANCE_SECONDS);
    await sleep(2500);
    await rpc("evm_mine", [], chain.rpc);
    expect(Math.abs(await clockSkew(chain.rpc))).toBeLessThan(TOLERANCE_SECONDS);
  });

  it("is within 2 s after the full demo reset: reset, sync, redeploy and seed (a burst of about 25 blocks)", async () => {
    await sleep(2500);
    await chain.reset(); // hardhat_reset + syncClock + deploy + register, the sequence dev:reset runs
    await rpc("evm_mine", [], chain.rpc);
    const block = Number.parseInt(((await rpc("eth_blockNumber", [], chain.rpc)) as string), 16);
    expect(block).toBeGreaterThan(20);
    expect(Math.abs(await clockSkew(chain.rpc))).toBeLessThan(TOLERANCE_SECONDS);
  });

  it("reports, rather than hides, a chain that is already ahead of the wall clock", async () => {
    await rpc("evm_increaseTime", [600], chain.rpc);
    await rpc("evm_mine", [], chain.rpc);
    expect(await clockSkew(chain.rpc)).toBeGreaterThan(500);
    const skew = await syncClock(chain.rpc); // cannot move backwards: must not throw, must say how far off it is
    expect(skew).toBeGreaterThan(500);
  });
});
