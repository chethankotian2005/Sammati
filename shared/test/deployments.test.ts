import { describe, expect, it } from "vitest";
import { EXPLORERS, deploymentLinks, explorerAddressUrl, explorerTxUrl } from "../src";

const TX = "0x" + "ab".repeat(32);
const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

describe("explorer links", () => {
  it("builds transaction and address pages for a network that has an explorer", () => {
    expect(explorerTxUrl("https://amoy.polygonscan.com", TX)).toBe(`https://amoy.polygonscan.com/tx/${TX}`);
    expect(explorerAddressUrl("https://amoy.polygonscan.com", ADDRESS)).toBe(`https://amoy.polygonscan.com/address/${ADDRESS}`);
  });

  it("tolerates a trailing slash in the configured base", () => {
    expect(explorerTxUrl("https://amoy.polygonscan.com/", TX)).toBe(`https://amoy.polygonscan.com/tx/${TX}`);
    expect(explorerAddressUrl("https://amoy.polygonscan.com///", ADDRESS)).toBe(`https://amoy.polygonscan.com/address/${ADDRESS}`);
  });

  it("returns null, not a made-up link, when there is no explorer (the local chain)", () => {
    expect(explorerTxUrl(undefined, TX)).toBeNull();
    expect(explorerTxUrl(null, TX)).toBeNull();
    expect(explorerTxUrl("", TX)).toBeNull();
    expect(explorerAddressUrl(undefined, ADDRESS)).toBeNull();
    expect(EXPLORERS.localhost).toBeUndefined();
    expect(EXPLORERS.hardhat).toBeUndefined();
  });

  it("knows Polygon Amoy's explorer", () => {
    expect(EXPLORERS.amoy).toBe("https://amoy.polygonscan.com");
  });

  it("links both contracts and both deploy transactions", () => {
    const registryTx = "0x" + "11".repeat(32);
    const anchorTx = "0x" + "22".repeat(32);
    const links = deploymentLinks(
      EXPLORERS.amoy!,
      { consentRegistry: ADDRESS, accessAnchor: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" },
      { consentRegistry: registryTx, accessAnchor: anchorTx },
    );
    expect(links).toEqual({
      consentRegistry: `https://amoy.polygonscan.com/address/${ADDRESS}`,
      accessAnchor: "https://amoy.polygonscan.com/address/0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      consentRegistryDeployTx: `https://amoy.polygonscan.com/tx/${registryTx}`,
      accessAnchorDeployTx: `https://amoy.polygonscan.com/tx/${anchorTx}`,
    });
  });
});
