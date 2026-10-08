// Resets Core to its seed state (trd.md §6.4). Needs `pnpm demo:up` running.
const core = process.env.CORE_URL ?? "http://localhost:4000";

try {
  const res = await fetch(`${core}/v1/demo/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Core answered ${res.status}: ${await res.text()}`);
  console.log(`Core reset at ${core}`);
} catch (err) {
  console.error(`Could not reset Core at ${core}: ${err instanceof Error ? err.message : err}`);
  console.error("Is `pnpm demo:up` running?");
  process.exit(1);
}
