import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { SkeletonTable } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { UserCheck } from "lucide-react";

// Deliberately its own small page rather than a filtered view bolted onto
// AdminDashboard.jsx — that file is already large, and a supervisor's
// entire job here is one thing (approve/reject agents in their area), so
// duplicating a small table is a better tradeoff than adding more
// conditional branches to an already-complex shared component.
export default function SupervisorDashboard() {
  const { token, user } = useAuth();
  const [scope, setScope] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api.supervisorMe(token), api.supervisorAgents(token)]);
      setScope(s);
      setAgents(a);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleAdvance(id, approval_status) {
    setBusyId(id);
    try {
      await api.supervisorAdvanceAgent(token, id, approval_status);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pending = agents.filter((a) => a.approval_status === "pending");
  const others = agents.filter((a) => a.approval_status !== "pending");

  return (
    <div className="max-w-4xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">SUPERVISOR</div>
      <h1 className="font-display text-3xl font-semibold mb-1 text-ink dark:text-paper">
        {user?.full_name?.split(" ")[0]}'s Area
      </h1>
      {scope && (
        <p className="text-sm text-slate dark:text-slate-light mb-8">
          You manage agents in <span className="font-semibold text-ink dark:text-paper">{scope.city}, {scope.state}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-600 mb-6">{error}</p>}

      {loading ? (
        <SkeletonTable rows={4} />
      ) : agents.length === 0 ? (
        <EmptyState icon={UserCheck} title="No agents in your area yet" description="Once agents sign up in your assigned city, they'll show up here for approval." />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <div className="text-xs font-mono uppercase text-slate dark:text-slate-light mb-3">
                Pending approval ({pending.length})
              </div>
              <div className="space-y-3">
                {pending.map((a) => (
                  <div key={a.id} className="border border-route bg-route/10 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-ink dark:text-paper">{a.full_name}</div>
                      <div className="text-xs text-slate dark:text-slate-light">
                        {a.phone} · {a.vehicle_type} · {a.city}, {a.state}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={busyId === a.id}
                        onClick={() => handleAdvance(a.id, "approved")}
                        className="min-h-[40px] px-4 rounded-lg bg-ink dark:bg-route text-paper dark:text-ink text-sm font-semibold disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === a.id}
                        onClick={() => handleAdvance(a.id, "rejected")}
                        className="min-h-[40px] px-4 rounded-lg border border-slate-300 dark:border-line text-sm font-semibold disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <div className="text-xs font-mono uppercase text-slate dark:text-slate-light mb-3">
                Everyone else ({others.length})
              </div>
              <div className="overflow-x-auto border border-slate-200 dark:border-line rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-paper dark:bg-white/5 text-left text-xs text-slate dark:text-slate-light uppercase font-mono">
                    <tr>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Vehicle</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100 dark:border-line">
                        <td className="px-4 py-3">
                          <div className="font-medium">{a.full_name}</div>
                          <div className="text-xs text-slate dark:text-slate-light">{a.phone}</div>
                        </td>
                        <td className="px-4 py-3 capitalize">{a.vehicle_type}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            a.approval_status === "approved" ? "bg-delivered/15 text-delivered" :
                            a.approval_status === "suspended" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {a.approval_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
