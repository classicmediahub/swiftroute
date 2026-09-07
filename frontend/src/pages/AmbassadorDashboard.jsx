import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Copy, Check, Users } from "lucide-react";

export default function AmbassadorDashboard() {
  const { token, user } = useAuth();
  const [me, setMe] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([api.ambassadorMe(token), api.ambassadorReferrals(token)]);
      setMe(m);
      setReferrals(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function handleCopy() {
    if (!me?.referral_code) return;
    navigator.clipboard.writeText(me.referral_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const rewardedCount = referrals.filter((r) => r.referral_reward_given).length;
  const totalEarned = rewardedCount * (me?.reward_per_agent || 0);

  return (
    <div className="max-w-2xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">AMBASSADOR</div>
      <h1 className="font-display text-3xl font-semibold mb-1 text-ink dark:text-paper">
        {user?.full_name?.split(" ")[0]}'s Referrals
      </h1>
      {me && (
        <p className="text-sm text-slate dark:text-slate-light mb-6">
          Recruiting agents in <span className="font-semibold text-ink dark:text-paper">{me.city}, {me.state}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-600 mb-6">{error}</p>}

      {!loading && me && (
        <>
          <div className="border border-slate-200 dark:border-line rounded-2xl p-5 mb-6">
            <div className="text-xs font-mono uppercase text-slate dark:text-slate-light mb-2">Your referral code</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-lg font-bold text-ink dark:text-paper bg-paper dark:bg-white/5 rounded-lg px-4 py-3">
                {me.referral_code || "—"}
              </div>
              <button
                onClick={handleCopy}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-line text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper"
                aria-label="Copy referral code"
              >
                {copied ? <Check className="w-4 h-4 text-delivered" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate dark:text-slate-light mt-2">
              Give this code to agents signing up — you earn ₦{me.reward_per_agent?.toLocaleString()} once they complete their first job.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="border border-slate-200 dark:border-line rounded-xl p-4">
              <div className="text-xs text-slate dark:text-slate-light mb-1">Agents referred</div>
              <div className="text-2xl font-semibold text-ink dark:text-paper">{referrals.length}</div>
            </div>
            <div className="border border-slate-200 dark:border-line rounded-xl p-4">
              <div className="text-xs text-slate dark:text-slate-light mb-1">Total earned</div>
              <div className="text-2xl font-semibold text-ink dark:text-paper">₦{totalEarned.toLocaleString()}</div>
            </div>
          </div>
        </>
      )}

      <div className="text-xs font-mono uppercase text-slate dark:text-slate-light mb-3">Your referrals</div>
      {loading ? (
        <SkeletonTable rows={3} />
      ) : referrals.length === 0 ? (
        <EmptyState icon={Users} title="No referrals yet" description="Share your code with agents signing up in your area — they'll show up here." />
      ) : (
        <div className="space-y-3">
          {referrals.map((r) => (
            <div key={r.id} className="border border-slate-200 dark:border-line rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-ink dark:text-paper">{r.full_name}</div>
                <div className="text-xs text-slate dark:text-slate-light">
                  {r.phone} · {r.city ? `${r.city}, ${r.state}` : "No profile yet"} · {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                r.referral_reward_given ? "bg-delivered/15 text-delivered" : "bg-slate-100 text-slate-600"
              }`}>
                {r.referral_reward_given ? "Reward earned" : r.approval_status === "approved" ? "Approved, awaiting first job" : "Pending approval"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
