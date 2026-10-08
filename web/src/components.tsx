import type { ReactNode } from "react";
import { useCoreStatus } from "./core";

export function CoreChip() {
  const status = useCoreStatus();
  const label =
    status.state === "up" ? "Core" : status.state === "down" ? "Core offline" : "Checking Core";
  const dot = status.state === "up" ? "bg-allow" : status.state === "down" ? "bg-block" : "bg-mute";
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-sm text-mute">
      <span className={`h-2 w-2 rounded-pill ${dot}`} />
      {label}
    </span>
  );
}

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="rounded-pass border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-mute">{children ?? "Coming soon."}</p>
    </section>
  );
}
