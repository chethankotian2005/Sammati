/**
 * ProcessorsSection — Downstream processors per purpose list, ack state and time (ui.md §3, C-06).
 */

import { useEffect, useState, type ReactNode } from "react";
import type { FiduciaryInfo, FiduciaryProcessorsResponse, NoticePurpose } from "@sammati/shared";
import { fetchProcessors } from "../../api";
import { StatusChip, HashLabel } from "../../ui";

interface ProcessorsSectionProps {
  company: FiduciaryInfo;
  purposes: NoticePurpose[];
}

export function ProcessorsSection({ company, purposes }: ProcessorsSectionProps): ReactNode {
  // Read from Core, so a company that joined through R-01 shows the processors it declared.
  const [processors, setProcessors] = useState<FiduciaryProcessorsResponse["processors"]>([]);
  useEffect(() => {
    let live = true;
    void fetchProcessors(company.address).then((p) => {
      if (live) setProcessors(p);
    });
    return () => {
      live = false;
    };
  }, [company.address]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-ink">Downstream Processors</h2>
        <p className="text-sm text-mute">
          Registered third-party data processors and automated withdrawal cascade contracts (C-06).
        </p>
      </div>

      <div className="rounded-pass border border-line bg-surface p-6 shadow-sm space-y-4">
        <h3 className="font-extrabold text-ink">Registered Processors for {company.name}</h3>

        {processors.length === 0 ? (
          <p className="text-sm text-mute">No downstream processors registered for this company.</p>
        ) : (
          <div className="space-y-3">
            {processors.map((proc) => {
              const matchedPurpose = purposes.find((p) => p.code === proc.purposeCode);
              return (
                <div
                  key={proc.address}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-row border border-line p-4 hover:bg-paper/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-ink">{proc.name}</span>
                      <StatusChip variant="verified" label="Verified Processor" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-mute">
                      <span>Address:</span>
                      <HashLabel value={proc.address} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-mute">Purpose:</span>{" "}
                      <span className="font-bold text-ink">
                        {matchedPurpose ? matchedPurpose.title.en : proc.purposeCode}
                      </span>
                    </div>
                    <div>
                      <StatusChip variant="active" label="Cascade Active" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-row bg-paper/60 p-4 text-xs text-mute space-y-1">
          <div className="font-bold text-ink">How cascade enforcement works:</div>
          <div>
            When a citizen withdraws consent in their wallet, the Sammati gateway notifies registered processors and records signed cryptographic acknowledgements on-chain.
          </div>
        </div>
      </div>
    </div>
  );
}
