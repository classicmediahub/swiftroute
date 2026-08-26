import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { Landmark, Check } from "lucide-react";

const STATUS_LABEL = {
  pending: "Awaiting review",
  approved: "Approved",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  failed: "Failed — refunded",
};
const STATUS_COLOR = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  rejected: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-800",
};

export default function WithdrawalPanel({ token, agentProfile, onChanged }) {
  const [banks, setBanks] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [nextDay, setNextDay] = useState("");
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_code: "", bank_name: "", account_number: "" });
  const [resolvedName, setResolvedName] = useState("");
  const [resolving, setResolving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [bankError, setBankError] = useState("");

  const [amount, setAmount] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const hasBankDetails = Boolean(agentProfile?.account_number);

  const loadHistory = useCallback(() => {
    api.myWithdrawals(token).then((d) => {
      setWithdrawals(d.withdrawals);
      setNextDay(d.next_withdrawal_day);
    }).catch(() => {});
  }, [token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (showBankForm && banks.length === 0) {
      api.listWithdrawalBanks(token).then(setBanks).catch(() => setBankError("Couldn't load the bank list"));
    }
  }, [showBankForm, banks.length, token]);

  async function handleResolve() {
    if (!bankForm.account_number || bankForm.account_number.length < 10 || !bankForm.bank_code) return;
    setResolving(true);
    setBankError("");
    setResolvedName("");
    try {
      const data = await api.resolveWithdrawalAccount(token, {
        account_number: bankForm.account_number,
        bank_code: bankForm.bank_code,
      });
      setResolvedName(data.account_name);
    } catch (err) {
      setBankError(err.message);
    } finally {
      setResolving(false);
    }
  }

  async function handleSaveBank(e) {
    e.preventDefault();
    setSavingBank(true);
    setBankError("");
    try {
      await api.saveWithdrawalBankDetails(token, bankForm);
      setShowBankForm(false);
      setBankForm({ bank_code: "", bank_name: "", account_number: "" });
      setResolvedName("");
      await onChanged?.(); // re-fetch agentProfile (see AuthContext's refresh) so account_number shows immediately
    } catch (err) {
      setBankError(err.message);
    } finally {
      setSavingBank(false);
    }
  }

  async function handleRequestWithdrawal(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1000) {
      setWithdrawError("Enter a valid amount (minimum ₦1,000)");
      return;
    }
    setWithdrawError("");
    setRequesting(true);
    try {
      await api.requestWithdrawal(token, amt);
      setAmount("");
      await loadHistory();
      await onChanged?.();
    } catch (err) {
      setWithdrawError(err.message);
    } finally {
      setRequesting(false);
    }
  }

  const hasOpenRequest = withdrawals.some((w) => ["pending", "approved", "processing"].includes(w.status));

  return (
    <div className="border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="w-4 h-4 text-route-dark shrink-0" />
        <div className="text-xs text-slate dark:text-slate-light">Withdraw to bank</div>
      </div>

      {/* Bank details */}
      {!showBankForm && (
        <div className="flex items-center justify-between mb-4">
          {hasBankDetails ? (
            <div className="text-sm text-ink dark:text-paper">
              <span className="font-semibold">{agentProfile.bank_name}</span> · {agentProfile.account_number}
              <div className="text-xs text-slate dark:text-slate-light">{agentProfile.account_name}</div>
            </div>
          ) : (
            <div className="text-sm text-slate dark:text-slate-light">No bank account saved yet</div>
          )}
          <button
            onClick={() => setShowBankForm(true)}
            className="text-xs font-semibold text-route-dark hover:underline shrink-0"
          >
            {hasBankDetails ? "Change" : "Add bank account"}
          </button>
        </div>
      )}

      {showBankForm && (
        <form onSubmit={handleSaveBank} className="border border-slate-200 dark:border-line rounded-lg p-4 mb-4 space-y-3">
          <select
            required
            value={bankForm.bank_code}
            onChange={(e) => {
              const bank = banks.find((b) => b.code === e.target.value);
              setBankForm((f) => ({ ...f, bank_code: e.target.value, bank_name: bank?.name || "" }));
              setResolvedName("");
            }}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          >
            <option value="">Select your bank</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
          <input
            required
            inputMode="numeric"
            maxLength={10}
            placeholder="Account number"
            value={bankForm.account_number}
            onChange={(e) => { setBankForm((f) => ({ ...f, account_number: e.target.value.replace(/\D/g, "") })); setResolvedName(""); }}
            onBlur={handleResolve}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
          {resolving && <p className="text-xs text-slate dark:text-slate-light">Verifying account…</p>}
          {resolvedName && (
            <p className="text-xs text-delivered flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {resolvedName}</p>
          )}
          {bankError && <p className="text-xs text-red-600">{bankError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!resolvedName || savingBank}
              className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
            >
              {savingBank ? "Saving…" : "Save account"}
            </button>
            <button
              type="button"
              onClick={() => { setShowBankForm(false); setBankError(""); setResolvedName(""); }}
              className="text-sm text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Request a withdrawal */}
      <form onSubmit={handleRequestWithdrawal} className="flex gap-2 mb-2">
        <input
          type="number"
          min="1000"
          disabled={!hasBankDetails || hasOpenRequest}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount to withdraw (₦)"
          className="flex-1 border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none disabled:opacity-60"
        />
        <button
          disabled={!hasBankDetails || hasOpenRequest || requesting}
          className="bg-ink dark:bg-route hover:opacity-90 text-paper dark:text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
        >
          {requesting ? "Requesting…" : "Withdraw"}
        </button>
      </form>
      {withdrawError && <p className="text-xs text-red-600 mb-2">{withdrawError}</p>}
      {hasOpenRequest && (
        <p className="text-xs text-slate dark:text-slate-light mb-2">
          You already have a withdrawal being reviewed — check the status below.
        </p>
      )}
      <p className="text-xs text-slate dark:text-slate-light mb-4">
        Withdrawals are processed every Monday and Thursday.
        {nextDay && nextDay !== "today" && ` Next window: ${nextDay}.`}
      </p>

      {/* History */}
      {withdrawals.length > 0 && (
        <div className="border-t border-slate-100 dark:border-line pt-4 space-y-2 max-h-56 overflow-y-auto">
          {withdrawals.map((w) => (
            <div key={w.id} className="flex items-center justify-between text-xs">
              <div>
                <div className="font-medium text-ink dark:text-paper">₦{w.amount.toLocaleString()}</div>
                <div className="text-slate dark:text-slate-light">{new Date(w.requested_at).toLocaleString()}</div>
                {w.status === "rejected" && w.rejection_reason && (
                  <div className="text-red-600 mt-0.5">{w.rejection_reason}</div>
                )}
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[w.status]}`}>
                {STATUS_LABEL[w.status] || w.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
