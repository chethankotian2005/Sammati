import { expect } from "chai";
import { AMOY_CHAIN_ID, DEFAULT_AMOY_RPC, amoyNetwork, deployerKey } from "../networks";
import { buildDeployment } from "../scripts/lib";

const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ANCHOR = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const REGISTRY_TX = "0x" + "11".repeat(32);
const ANCHOR_TX = "0x" + "22".repeat(32);

describe("Polygon Amoy network config", () => {
  it("reads the RPC URL and the deployer key from the environment", () => {
    const cfg = amoyNetwork({ AMOY_RPC_URL: "https://my-node.example/amoy", DEPLOYER_KEY: KEY });
    expect(cfg).to.deep.equal({ url: "https://my-node.example/amoy", chainId: AMOY_CHAIN_ID, accounts: [KEY] });
    expect(AMOY_CHAIN_ID).to.equal(80002);
  });

  it("falls back to Polygon's public RPC", () => {
    expect(amoyNetwork({}).url).to.equal(DEFAULT_AMOY_RPC);
    expect(amoyNetwork({ AMOY_RPC_URL: "   " }).url).to.equal(DEFAULT_AMOY_RPC);
  });

  it("accepts a key without the 0x prefix, and surrounding whitespace", () => {
    expect(deployerKey({ DEPLOYER_KEY: KEY.slice(2) })).to.equal(KEY);
    expect(deployerKey({ DEPLOYER_KEY: `  ${KEY}\n` })).to.equal(KEY);
  });

  it("has no accounts, instead of failing, without a valid key (so compile and test still work)", () => {
    for (const bad of [undefined, "", "not a key", "0x1234", KEY + "00", "0xzz" + KEY.slice(4)]) {
      expect(amoyNetwork({ DEPLOYER_KEY: bad }).accounts, String(bad)).to.deep.equal([]);
      expect(deployerKey({ DEPLOYER_KEY: bad }), String(bad)).to.equal(null);
    }
  });
});

describe("deployment record", () => {
  const deployed = {
    chainId: 80002,
    admin: ADMIN,
    consentRegistry: REGISTRY,
    accessAnchor: ANCHOR,
    startBlock: 12345,
    deployTxs: { consentRegistry: REGISTRY_TX, accessAnchor: ANCHOR_TX },
  };

  it("records the explorer and links to both contracts and both deploy transactions on Amoy", () => {
    expect(buildDeployment("amoy", deployed)).to.deep.equal({
      chainId: 80002,
      admin: ADMIN,
      consentRegistry: REGISTRY,
      accessAnchor: ANCHOR,
      startBlock: 12345,
      explorerUrl: "https://amoy.polygonscan.com",
      links: {
        consentRegistry: `https://amoy.polygonscan.com/address/${REGISTRY}`,
        accessAnchor: `https://amoy.polygonscan.com/address/${ANCHOR}`,
        consentRegistryDeployTx: `https://amoy.polygonscan.com/tx/${REGISTRY_TX}`,
        accessAnchorDeployTx: `https://amoy.polygonscan.com/tx/${ANCHOR_TX}`,
      },
    });
  });

  it("records no explorer and no links for the local chain, which has none", () => {
    const local = buildDeployment("localhost", { ...deployed, chainId: 31337 });
    expect(local).to.deep.equal({ chainId: 31337, admin: ADMIN, consentRegistry: REGISTRY, accessAnchor: ANCHOR, startBlock: 12345 });
    expect(local).to.not.have.property("explorerUrl");
    expect(local).to.not.have.property("links");
  });
});
