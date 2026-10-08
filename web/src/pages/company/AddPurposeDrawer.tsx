/**
 * AddPurposeDrawer — Drawer for defining a new purpose in 3 languages (C-01).
 * Registered on-chain via Core: POST /v1/fiduciaries/:fid/purposes.
 */

import { useState, type FormEvent, type ReactNode } from "react";
import type { RegisterPurposeBody, FiduciaryInfo } from "@sammati/shared";
import { Drawer } from "../../ui";
import { registerPurpose } from "../../api";

interface AddPurposeDrawerProps {
  open: boolean;
  onClose: () => void;
  company: FiduciaryInfo;
  onPurposeAdded: () => void;
}

export function AddPurposeDrawer({
  open,
  onClose,
  company,
  onPurposeAdded,
}: AddPurposeDrawerProps): ReactNode {
  const [code, setCode] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleHi, setTitleHi] = useState("");
  const [titleKn, setTitleKn] = useState("");
  const [descEn, setDescEn] = useState("");
  const [descHi, setDescHi] = useState("");
  const [descKn, setDescKn] = useState("");
  const [categoriesStr, setCategoriesStr] = useState("PAN, statement");
  const [retentionDays, setRetentionDays] = useState(365);
  const [sharesThirdParty, setSharesThirdParty] = useState(false);
  const [required, setRequired] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCode("");
    setTitleEn("");
    setTitleHi("");
    setTitleKn("");
    setDescEn("");
    setDescHi("");
    setDescKn("");
    setCategoriesStr("PAN, statement");
    setRetentionDays(365);
    setSharesThirdParty(false);
    setRequired(false);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !titleEn.trim() || !descEn.trim()) {
      setError("Purpose code, English title, and English description are required.");
      return;
    }

    setLoading(true);
    setError(null);

    const categories = categoriesStr
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const body: RegisterPurposeBody = {
      code: code.trim().toLowerCase().replace(/\s+/g, "_"),
      title: {
        en: titleEn.trim(),
        hi: titleHi.trim() || `[hi] ${titleEn.trim()}`,
        kn: titleKn.trim() || `[kn] ${titleEn.trim()}`,
      },
      description: {
        en: descEn.trim(),
        hi: descHi.trim() || `[hi] ${descEn.trim()}`,
        kn: descKn.trim() || `[kn] ${descEn.trim()}`,
      },
      dataCategories: categories.length > 0 ? categories : ["general"],
      retentionDays: Number(retentionDays) || 365,
      sharesThirdParty,
      required,
    };

    try {
      await registerPurpose(company.address, body);
      resetForm();
      onPurposeAdded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register purpose");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Add consent purpose" widthClass="w-[500px] max-w-full">
      <form onSubmit={handleSubmit} className="space-y-5 text-sm">
        {error && (
          <div className="rounded-row bg-block/10 p-3 text-xs font-semibold text-block">
            {error}
          </div>
        )}

        {/* Code */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-mute">
            Purpose code
          </label>
          <input
            type="text"
            required
            placeholder="e.g. kyc_check, marketing"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-ink focus:border-marigold focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-mute">
            Unique machine identifier, used by the gateway requireConsent SDK.
          </p>
        </div>

        {/* Multilingual Titles */}
        <div className="rounded-row border border-line bg-paper/60 p-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink">
            Title (3 languages)
          </label>
          <div className="mt-2 space-y-2">
            <div>
              <span className="text-[11px] font-semibold text-mute">English:</span>
              <input
                type="text"
                required
                placeholder="Credit check"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                className="mt-0.5 w-full rounded-row border border-line bg-surface px-3 py-1.5 text-ink focus:border-marigold focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-mute">हिन्दी (Hindi):</span>
              <input
                type="text"
                placeholder="क्रेडिट जांच"
                value={titleHi}
                onChange={(e) => setTitleHi(e.target.value)}
                className="mt-0.5 w-full rounded-row border border-line bg-surface px-3 py-1.5 text-ink focus:border-marigold focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-mute">ಕನ್ನಡ (Kannada):</span>
              <input
                type="text"
                placeholder="ಕ್ರೆಡಿಟ್ ತಪಾಸಣೆ"
                value={titleKn}
                onChange={(e) => setTitleKn(e.target.value)}
                className="mt-0.5 w-full rounded-row border border-line bg-surface px-3 py-1.5 text-ink focus:border-marigold focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Multilingual Descriptions */}
        <div className="rounded-row border border-line bg-paper/60 p-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink">
            Plain description (3 languages)
          </label>
          <div className="mt-2 space-y-2">
            <div>
              <span className="text-[11px] font-semibold text-mute">English:</span>
              <textarea
                required
                rows={2}
                placeholder="Verify your credit score and financial eligibility"
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                className="mt-0.5 w-full rounded-row border border-line bg-surface px-3 py-1.5 text-ink focus:border-marigold focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-mute">हिन्दी (Hindi):</span>
              <input
                type="text"
                placeholder="अपनी वित्तीय पात्रता और क्रेडिट स्कोर सत्यापित करें"
                value={descHi}
                onChange={(e) => setDescHi(e.target.value)}
                className="mt-0.5 w-full rounded-row border border-line bg-surface px-3 py-1.5 text-ink focus:border-marigold focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-mute">ಕನ್ನಡ (Kannada):</span>
              <input
                type="text"
                placeholder="ನಿಮ್ಮ ಕ್ರೆಡಿಟ್ ಸ್ಕೋರ್ ಮತ್ತು ಅರ್ಹತೆಯನ್ನು ಪರಿಶೀಲಿಸಿ"
                value={descKn}
                onChange={(e) => setDescKn(e.target.value)}
                className="mt-0.5 w-full rounded-row border border-line bg-surface px-3 py-1.5 text-ink focus:border-marigold focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Data Categories & Retention */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-mute">
              Data categories
            </label>
            <input
              type="text"
              placeholder="PAN, salary, income"
              value={categoriesStr}
              onChange={(e) => setCategoriesStr(e.target.value)}
              className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-ink focus:border-marigold focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-mute">Comma-separated</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-mute">
              Retention (days)
            </label>
            <input
              type="number"
              min={1}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="mt-1 w-full rounded-row border border-line bg-surface px-3 py-2 text-ink focus:border-marigold focus:outline-none"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3 rounded-row border border-line p-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-bold text-ink">Third-party sharing</div>
              <div className="text-[11px] text-mute">
                Shared with downstream processors (flags block-tinted chip)
              </div>
            </div>
            <input
              type="checkbox"
              checked={sharesThirdParty}
              onChange={(e) => setSharesThirdParty(e.target.checked)}
              className="h-4 w-4 accent-marigold"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer border-t border-line pt-2">
            <div>
              <div className="font-bold text-ink">Needed for service</div>
              <div className="text-[11px] text-mute">
                Required for core service vs optional marketing/analytics
              </div>
            </div>
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 accent-marigold"
            />
          </label>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-row bg-ink py-2.5 font-bold text-paper transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {loading ? "Registering on ledger…" : "Register purpose on chain"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
