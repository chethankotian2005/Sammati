// Finds the address a phone on the same network can reach this laptop on, for the QR code (trd.md §6.1).
import { networkInterfaces } from "node:os";

// Adapters that have an IPv4 address but are not a network a phone can join.
const VIRTUAL = /virtual|vmware|vbox|virtualbox|docker|wsl|hyper-v|vethernet|loopback|tailscale|zerotier|bluetooth|vpn|tun|tap|utun|awdl|llw|br-|veth/i;
const PREFERRED_NAME = /wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d|local area connection/i;

/** Higher is better; null means "not a candidate". */
function score(name, address) {
  if (VIRTUAL.test(name)) return null;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p))) return null;
  const [a, b] = parts;
  if (a === 127 || a === 0 || (a === 169 && b === 254)) return null; // loopback, unassigned, link-local
  let s;
  if (a === 192 && b === 168) s = 30; // home routers and phone hotspots
  else if (a === 10) s = 20;
  else if (a === 172 && b >= 16 && b <= 31) s = 10;
  else return null; // a public or carrier-grade address is not a network the phone shares
  return s + (PREFERRED_NAME.test(name) ? 5 : 0);
}

/**
 * Every usable LAN IPv4 address, best first. `interfaces` has the shape of os.networkInterfaces()
 * and is a parameter so the choice can be tested without the machine it runs on.
 */
export function lanAddresses(interfaces = networkInterfaces()) {
  const found = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const a of addrs ?? []) {
      const family = typeof a.family === "string" ? a.family : `IPv${a.family}`; // older Node reported 4 / 6
      if (family !== "IPv4" || a.internal) continue;
      const s = score(name, a.address);
      if (s !== null) found.push({ name, address: a.address, score: s });
    }
  }
  return found.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
}

/**
 * The address the QR code gives the phone for Core, and the banner that says so. `localhost` would be the
 * phone itself, so unless CORE_PUBLIC_URL says otherwise this is the laptop's LAN address. A laptop can be on
 * two networks (its Wi-Fi and the hotspot the phone joined), so every candidate is listed and the choice
 * can be overridden.
 */
export function describeQrUrl({ port, env = process.env, interfaces = networkInterfaces() }) {
  const candidates = lanAddresses(interfaces);
  const explicit = env.CORE_PUBLIC_URL?.trim();
  const source = explicit ? "env" : candidates.length ? "detected" : "none";
  const url = explicit || `http://${candidates[0]?.address ?? "localhost"}:${port}`;

  const lines = ["Wallet QR codes will point the phone at Core on:", "", `    ${url}`, ""];
  if (source === "env") lines.push("(from CORE_PUBLIC_URL)");
  else if (source === "none") {
    lines.push("!! No LAN address found: this laptop is not on a network a phone can join.");
    lines.push("!! The QR will say localhost and a phone cannot use it. Connect, or set CORE_PUBLIC_URL.");
  } else {
    lines.push(`(detected on ${candidates[0].name}; override with CORE_PUBLIC_URL)`);
    if (candidates.length > 1) {
      lines.push("Other addresses on this laptop:");
      for (const c of candidates.slice(1)) lines.push(`    http://${c.address}:${port}   (${c.name})`);
    }
  }
  const bar = "=".repeat(Math.max(...lines.map((l) => l.length)) + 4);
  return { url, source, candidates, banner: [bar, ...lines.map((l) => `  ${l}`), bar].join("\n") };
}

/** The best LAN IPv4 address, or null when the machine is on no network a phone could share. */
export function pickLanAddress(interfaces = networkInterfaces()) {
  return lanAddresses(interfaces)[0]?.address ?? null;
}
