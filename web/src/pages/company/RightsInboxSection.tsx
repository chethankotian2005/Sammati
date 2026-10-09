import { useEffect, useState, type ReactNode } from "react";
import { type FiduciaryInfo } from "@sammati/shared";
import { fetchRightsRequests, updateRightsRequest } from "../../api";
import { HashLabel } from "../../ui";

interface RightsInboxSectionProps {
  company: FiduciaryInfo;
}

export function RightsInboxSection({ company }: RightsInboxSectionProps): ReactNode {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<{ [id: string]: string }>({});
  const [updating, setUpdating] = useState<{ [id: string]: boolean }>({});

  useEffect(() => {
    void loadRequests();
  }, [company.address]);

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await fetchRightsRequests(company.address);
      setRequests(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(id: string) {
    setUpdating(prev => ({ ...prev, [id]: true }));
    try {
      await updateRightsRequest(company.address, id, "resolved", replyText[id] || null);
      await loadRequests();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(prev => ({ ...prev, [id]: false }));
    }
  }

  if (loading) {
    return <div className="p-6 text-mute">Loading inbox...</div>;
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-pass border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-ink">Rights Inbox</h2>
        <p className="mt-3 text-sm text-mute">No rights requests have been filed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-pass border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-ink">Rights Inbox</h2>
        <p className="mt-1 text-sm text-mute">
          Manage data rights requests and grievances from your customers.
        </p>
      </div>

      <div className="space-y-4">
        {requests.map(req => (
          <div key={req.id} className="rounded-pass border border-line bg-surface p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink uppercase">{req.type}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${req.status === "resolved" ? "bg-marigold/20 text-marigold" : "bg-ink text-paper"}`}>
                    {req.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-mute">
                  Principal: <HashLabel value={req.principal} />
                </div>
                <div className="mt-1 text-sm text-ink">{req.note}</div>
                {req.reply && (
                  <div className="mt-2 text-sm italic text-mute border-l-2 border-line pl-2">
                    Reply: {req.reply}
                  </div>
                )}
              </div>
              
              {req.status !== "resolved" && (
                <div className="flex flex-col gap-2 items-end">
                  <input 
                    type="text" 
                    placeholder="Optional reply..."
                    className="border border-line rounded px-2 py-1 text-sm"
                    value={replyText[req.id] || ""}
                    onChange={e => setReplyText(prev => ({ ...prev, [req.id]: e.target.value }))}
                  />
                  <button 
                    disabled={updating[req.id]}
                    onClick={() => handleResolve(req.id)}
                    className="bg-ink text-paper px-3 py-1.5 rounded-row text-xs font-bold hover:bg-ink/90 disabled:opacity-50"
                  >
                    {updating[req.id] ? "Saving..." : "Resolve"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
