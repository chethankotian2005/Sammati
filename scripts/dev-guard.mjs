// Both dev scripts refuse to run unless DEV_TOOLS=true, and never beside NODE_ENV=production (trd.md §6.4).
export function requireDevTools(name) {
  if (process.env.DEV_TOOLS !== "true") {
    console.error(`${name} changes or erases state on purpose, so it needs DEV_TOOLS=true.`);
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error(`${name}: DEV_TOOLS=true is not allowed with NODE_ENV=production.`);
    process.exit(1);
  }
}
