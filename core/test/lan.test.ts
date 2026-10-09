import { describe, expect, it } from "vitest";
import { describeQrUrl, lanAddresses, pickLanAddress, type InterfaceAddress } from "../../scripts/lan.mjs";

const v4 = (address: string, internal = false): InterfaceAddress => ({ address, family: "IPv4", internal });
const v6 = (address: string): InterfaceAddress => ({ address, family: "IPv6", internal: false });

// A Windows laptop as it really looks: loopback, Wi-Fi, a WSL/Hyper-V adapter, VirtualBox, link-local noise.
const typical = {
  "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true), v6("::1")],
  "Wi-Fi": [v6("fe80::1"), v4("192.168.1.23")],
  "vEthernet (WSL)": [v4("172.28.64.1")],
  "VirtualBox Host-Only Network": [v4("192.168.56.1")],
  "Ethernet 2": [v4("169.254.10.5")],
};

describe("finding the address a phone can reach", () => {
  it("picks the real network, not the loopback, the virtual adapters or link-local noise", () => {
    expect(pickLanAddress(typical)).toBe("192.168.1.23");
    expect(lanAddresses(typical).map((a) => a.address)).toEqual(["192.168.1.23"]);
  });

  it("finds a phone-hotspot address on an adapter with an odd name", () => {
    expect(pickLanAddress({ "Local Area Connection* 3": [v4("192.168.137.1")], "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)] })).toBe("192.168.137.1");
  });

  it("handles Node versions that report the family as a number", () => {
    expect(pickLanAddress({ en0: [{ address: "10.0.0.7", family: 4, internal: false }] })).toBe("10.0.0.7");
    expect(pickLanAddress({ en0: [{ address: "::1", family: 6, internal: false }] })).toBeNull();
  });

  it("prefers 192.168 over 10.x over 172.16-31, and a named Wi-Fi/Ethernet over an unnamed adapter", () => {
    const order = lanAddresses({ eth0: [v4("172.20.0.5")], "Wi-Fi": [v4("10.1.2.3")], Other: [v4("192.168.9.9")] }).map((a) => a.address);
    expect(order).toEqual(["192.168.9.9", "10.1.2.3", "172.20.0.5"]);
    expect(lanAddresses({ Wi_Fi_like: [v4("192.168.1.2")], "Wi-Fi": [v4("192.168.1.3")] })[0]!.address).toBe("192.168.1.3");
    expect(lanAddresses({ a: [v4("172.31.0.1")], b: [v4("172.32.0.1")], c: [v4("8.8.8.8")], d: [v4("100.64.0.1")] }).map((x) => x.address)).toEqual(["172.31.0.1"]);
  });

  it("returns null on a machine with no usable network", () => {
    expect(pickLanAddress({ lo: [v4("127.0.0.1", true)] })).toBeNull();
    expect(pickLanAddress({})).toBeNull();
  });
});

describe("the QR address and its banner", () => {
  it("uses the detected LAN address and port, and says where it came from", () => {
    const qr = describeQrUrl({ port: "4000", env: {}, interfaces: typical });
    expect(qr.url).toBe("http://192.168.1.23:4000");
    expect(qr.source).toBe("detected");
    expect(qr.banner).toContain("http://192.168.1.23:4000");
    expect(qr.banner).toContain("detected on Wi-Fi");
  });

  it("lets PUBLIC_CORE_URL override detection, as given", () => {
    const qr = describeQrUrl({ port: "4000", env: { PUBLIC_CORE_URL: "http://192.168.43.10:4000" }, interfaces: typical });
    expect(qr.url).toBe("http://192.168.43.10:4000");
    expect(qr.source).toBe("env");
    expect(qr.banner).toContain("from PUBLIC_CORE_URL");
    expect(qr.banner).not.toContain("192.168.1.23");
  });

  it("ignores an empty PUBLIC_CORE_URL (a copied .env.example line) instead of using it", () => {
    expect(describeQrUrl({ port: "4000", env: { PUBLIC_CORE_URL: "  " }, interfaces: typical }).url).toBe("http://192.168.1.23:4000");
  });

  it("lists the other networks when there are several, so the operator can choose the phone's", () => {
    const qr = describeQrUrl({ port: "4000", env: {}, interfaces: { "Wi-Fi": [v4("192.168.1.23")], "Local Area Connection* 3": [v4("192.168.137.1")] } });
    expect(qr.candidates).toHaveLength(2);
    expect(qr.banner).toContain("Other addresses on this laptop");
    expect(qr.banner).toContain("http://192.168.137.1:4000");
  });

  it("follows a non-default port", () => {
    expect(describeQrUrl({ port: 4100, env: {}, interfaces: typical }).url).toBe("http://192.168.1.23:4100");
  });

  it("warns loudly, and falls back to localhost, when there is no network", () => {
    const qr = describeQrUrl({ port: "4000", env: {}, interfaces: { lo: [v4("127.0.0.1", true)] } });
    expect(qr.source).toBe("none");
    expect(qr.url).toBe("http://localhost:4000");
    expect(qr.banner).toContain("!! No LAN address found");
  });
});
