import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { Gift, Check, Copy } from "lucide-react";

// Reward amounts shown here are just copy — the source of truth is
// REFERRAL_REWARD in backend/referrals.js. If you tune those numbers,
// update the two labels below to match, or they'll drift out of sync.
const REWARD_COPY = {
  customer: "₦500 when they complete their first delivery or ride",
  agent: "₦800 when they complete their first job",
};

export default function ReferralCard({ token, role }) {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.getReferralInfo(token).then(setInfo).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleCopy() {
    if (!info?.referral_link) return;
    navigator.clipboard.writeText(info.referral_link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!info) return null;

  return (
    <div className="border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="w-4 h-4 text-route-dark shrink-0" />
        <div className="text-xs text-slate dark:text-slate-light">Refer & earn</div>
      </div>
      <p className="text-sm text-ink dark:text-paper mb-4">
        Share your link — you earn <span className="font-semibold">{REWARD_COPY[role] || REWARD_COPY.customer}</span>.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          readOnly
          value={info.referral_link || ""}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-xs font-mono bg-paper dark:bg-white/5 text-ink dark:text-paper outline-none"
        />
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-3.5 py-2 text-xs transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex items-center gap-6 text-xs">
        <div>
          <div className="font-mono font-semibold text-base text-ink dark:text-paper">{info.referred_count}</div>
          <div className="text-slate dark:text-slate-light">People referred</div>
        </div>
        <div>
          <div className="font-mono font-semibold text-base text-ink dark:text-paper">{info.rewarded_count}</div>
          <div className="text-slate dark:text-slate-light">Completed & paid out</div>
        </div>
        <div>
          <div className="font-mono font-semibold text-base text-delivered">₦{info.total_earned.toLocaleString()}</div>
          <div className="text-slate dark:text-slate-light">Total earned</div>
        </div>
      </div>
    </div>
  );
}
