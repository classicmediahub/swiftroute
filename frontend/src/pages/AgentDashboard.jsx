import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useRideLocation } from "../hooks/useRideLocation";
import RideMeter from "../components/RideMeter";
import TripStatusStepper, { RIDE_STEPS, DELIVERY_STEPS } from "../components/TripStatusStepper";
import StatusBadge from "../components/StatusBadge";
import StarRating from "../components/StarRating";
import ShareLocationToggle from "../components/ShareLocationToggle";

// 'in_transit' branches two ways depending on whether this delivery has a
// locker_id: a normal delivery goes straight to "delivered", a locker
// delivery stops at "at_locker" instead (see backend/routes/deliveries.js's
// nextStatusFor) — the button label needs to reflect which one is actually
// about to happen, not always say "Mark delivered".
function nextLabelFor(d) {
  if (d.status === "accepted") return "Mark picked up";
  if (d.status === "picked_up") return "Mark in transit";
  if (d.status === "in_transit") return d.locker_id ? "Drop off at locker" : "Mark delivered";
  return null; // covers 'at_locker' too — no further agent action, see the pickup-code card instead
}

const RIDE_NEXT_LABEL = {
  accepted: "Start trip",
  in_progress: "End trip",
};
// RIDE_STATUS_LABEL removed — TripStatusStepper (imported above) now
// renders ride progress instead of a flat status badge.
const RIDE_ACTIVE_STATUSES = ["accepted", "in_progress"];

export default function AgentDashboard() {
  const { token, user, agentProfile, refresh } = useAuth();
  const [section, setSection] = useState("deliveries"); // "deliveries" | "rides" — rides only shown to cab agents
  const [tab, setTab] = useState("available");
  const [available, setAvailable] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [pools, setPools] = useState([]);
  const [poolBusyId, setPoolBusyId] = useState(null);
  const [proofPhotos, setProofPhotos] = useState({}); // deliveryId -> data URL, cleared once submitted

  function handleProofPhotoSelected(deliveryId, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProofPhotos((p) => ({ ...p, [deliveryId]: reader.result }));
    reader.readAsDataURL(file);
  }
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const [rideTab, setRideTab] = useState("available");
  const [availableRides, setAvailableRides] = useState([]);
  const [assignedRides, setAssignedRides] = useState([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const [rideError, setRideError] = useState("");

  const isApproved = agentProfile?.approval_status === "approved";

  // Rides phase 1: only cab agents broadcast live location. No manual
  // online/offline toggle by design — being on this dashboard, approved,
  // with location permission granted IS being online. Bike/self agents
  // just don't run this at all yet.
  const isLiveRideCandidate = isApproved && agentProfile?.vehicle_type === "cab";
  useLiveLocation(token, isLiveRideCandidate);

  // Rides phase 2: while this agent has a ride actively accepted/in
  // progress, also broadcast position to that SPECIFIC ride (separate from
  // the general "online" broadcast above, which keeps running regardless).
  // This is what lets the customer's live map actually move.
  const activeRide = assignedRides.find((r) => RIDE_ACTIVE_STATUSES.includes(r.status));
  useRideLocation(token, activeRide?.id);

  const loadAll = useCallback(async () => {
    if (!isApproved) { setLoading(false); return; }
    try {
      const [avail, mine, claimable] = await Promise.all([
        api.availableDeliveries(token), api.assignedDeliveries(token), api.claimablePools(token),
      ]);
      // Pooled deliveries are shown exclusively via the pools section below
      // (batch-accept only) — excluded here so an agent can't cherry-pick
      // just one delivery out of a pool through the normal "Accept job"
      // button, which would defeat the whole point of pooling (guaranteeing
      // one agent handles the whole cluster in one trip).
      setAvailable(avail.filter((d) => !d.pool_id));
      setAssigned(mine);
      setPools(claimable);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, isApproved]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadRides = useCallback(async () => {
    if (!isLiveRideCandidate) { setLoadingRides(false); return; }
    try {
      const [avail, mine] = await Promise.all([api.availableRides(token), api.assignedRides(token)]);
      setAvailableRides(avail);
      setAssignedRides(mine);
    } catch (err) {
      setRideError(err.message);
    } finally {
      setLoadingRides(false);
    }
  }, [token, isLiveRideCandidate]);

  useEffect(() => { loadRides(); }, [loadRides]);

  async function handleAccept(id) {
    setBusyId(id);
    try {
      await api.acceptDelivery(token, id);
      await loadAll();
      setTab("mine");
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAcceptPool(poolId) {
    setPoolBusyId(poolId);
    try {
      await api.acceptPool(token, poolId);
      await loadAll();
      setTab("mine");
    } catch (err) {
      alert(err.message);
    } finally {
      setPoolBusyId(null);
    }
  }

  async function handleAdvance(id, delivery) {
    // A normal (non-locker) delivery reaching its final step needs a
    // proof photo — enforced here client-side (so the agent isn't
    // surprised by a rejected request) AND server-side (the source of
    // truth; this check alone is just a better UX, not the real gate).
    const isFinalDeliveredStep = delivery.status === "in_transit" && !delivery.locker_id;
    if (isFinalDeliveredStep && !proofPhotos[id]) {
      alert("Please attach a proof-of-delivery photo before marking this delivered.");
      return;
    }
    setBusyId(id);
    try {
      await api.advanceDelivery(token, id, isFinalDeliveredStep ? { proof_photo: proofPhotos[id] } : undefined);
      setProofPhotos((p) => { const next = { ...p }; delete next[id]; return next; });
      await loadAll();
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAcceptRide(id) {
    setBusyId(id);
    try {
      await api.acceptRide(token, id);
      await loadRides();
      setRideTab("mine");
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvanceRide(id) {
    setBusyId(id);
    try {
      await api.advanceRide(token, id);
      await loadRides();
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAgentCancelRide(id) {
    if (!confirm("Cancel this ride? The rider will be refunded automatically if they already paid.")) return;
    setBusyId(id);
    try {
      await api.agentCancelRide(token, id);
      await loadRides();
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!agentProfile) {
    return <div className="max-w-4xl mx-auto px-5 py-10 text-slate">Loading profile…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">AGENT DASHBOARD</div>
      <div className="flex items-center gap-3 mb-6">
        {user?.profile_photo && (
          <img src={user.profile_photo} alt={user.full_name} className="w-12 h-12 rounded-full object-cover border border-slate-200" />
        )}
        <h1 className="font-display text-3xl font-semibold">Your jobs</h1>
        {isLiveRideCandidate && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-mono text-slate">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
            </span>
            Visible to riders nearby
          </span>
        )}
      </div>

      {/* Profile summary */}
      <div className="grid sm:grid-cols-5 gap-4 mb-8">
        <SummaryCard label="Vehicle" value={agentProfile.vehicle_type} />
        <SummaryCard label="Approval" custom={<StatusBadge status={agentProfile.approval_status} />} />
        <SummaryCard label="Deliveries done" value={agentProfile.total_deliveries} />
        <SummaryCard
          label="Rating"
          custom={
            agentProfile.total_deliveries > 0 ? (
              <div className="flex items-center gap-1.5">
                <StarRating value={Math.round(agentProfile.rating)} readOnly size={14} />
                <span className="font-mono text-xs text-slate">{Number(agentProfile.rating).toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-xs text-slate">No reviews yet</span>
            )
          }
        />
        <SummaryCard label="Wallet balance" value={`₦${agentProfile.wallet_balance.toLocaleString()}`} />
      </div>

      {!isApproved ? (
        <div className="border border-signal/40 bg-signal/10 rounded-2xl p-6 text-ink">
          <h2 className="font-display font-semibold mb-1 text-signal">Your application is under review</h2>
          <p className="text-sm">
            An admin needs to approve your agent profile before you can see and accept deliveries. This usually
            takes a short while — check back soon.
          </p>
        </div>
      ) : (
        <>
          {/* Deliveries vs Rides — only cab agents get a Rides section at all */}
          {isLiveRideCandidate && (
            <div className="flex gap-2 mb-4">
              <SectionButton active={section === "deliveries"} onClick={() => setSection("deliveries")}>
                Deliveries
              </SectionButton>
              <SectionButton active={section === "rides"} onClick={() => setSection("rides")}>
                Rides ({availableRides.length})
              </SectionButton>
            </div>
          )}

          {section === "deliveries" ? (
            <>
              <div className="flex gap-2 mb-6 border-b border-slate-200">
                <TabButton active={tab === "available"} onClick={() => setTab("available")}>
                  Available ({available.length})
                </TabButton>
                <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
                  My deliveries ({assigned.length})
                </TabButton>
              </div>

              {error && <p className="text-sm text-signal mb-4">{error}</p>}
              {!loading && tab === "available" && pools.length > 0 && (
                <div className="space-y-3 mb-4">
                  {pools.map((p) => (
                    <div key={p.pool_id} className="border border-route/40 bg-route/10 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-route-dark mb-1">
                          POOL · {p.member_count} deliveries together
                        </div>
                        <div className="font-semibold text-sm">{p.institution_name}</div>
                        <div className="text-xs text-slate mt-0.5">
                          Accept once to take the whole group as a single trip.
                        </div>
                      </div>
                      <button
                        disabled={poolBusyId === p.pool_id}
                        onClick={() => handleAcceptPool(p.pool_id)}
                        className="shrink-0 text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-3.5 py-2.5 transition-colors disabled:opacity-60"
                      >
                        {poolBusyId === p.pool_id ? "Accepting…" : `Accept pool (${p.member_count})`}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {loading ? (
                <p className="text-sm text-slate">Loading…</p>
              ) : tab === "available" ? (
                available.length === 0 ? (
                  <EmptyState text="No pending deliveries match your vehicle type right now." />
                ) : (
                  <div className="space-y-3">
                    {available.map((d) => (
                      <div key={d.id} className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                        <div>
                          <div className="font-mono text-xs text-slate mb-1">{d.tracking_code}</div>
                          <div className="font-semibold text-sm mb-1">
                            {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                            {d.distance_km && <span className="text-slate font-normal"> · {d.distance_km} km</span>}
                          </div>
                          <div className="text-xs text-slate space-y-0.5">
                            <div>Pickup: {d.pickup_address}{d.pickup_landmark && ` (${d.pickup_landmark})`}</div>
                            <div>Drop-off: {d.dropoff_address}{d.dropoff_landmark && ` (${d.dropoff_landmark})`}</div>
                            <div>Customer: {d.customer_name} · {d.customer_phone}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-semibold mb-2">₦{d.price.toLocaleString()}</div>
                          <button
                            disabled={busyId === d.id}
                            onClick={() => handleAccept(d.id)}
                            className="text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-2 hover:bg-ink-soft transition-colors disabled:opacity-60"
                          >
                            {busyId === d.id ? "Accepting…" : "Accept job"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : assigned.length === 0 ? (
                <EmptyState text="You haven't accepted any deliveries yet." />
              ) : (
                <div className="space-y-3">
                  {assigned.map((d) => (
                    <div key={d.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-mono text-xs text-slate mb-1">{d.tracking_code}</div>
                          <div className="font-semibold text-sm">
                          {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                          {d.distance_km && <span className="text-slate font-normal"> · {d.distance_km} km</span>}
                        </div>
                        </div>
                      </div>
                      <TripStatusStepper steps={DELIVERY_STEPS} currentKey={d.status} className="mb-3" />
                      <div className="text-xs text-slate space-y-0.5 mb-3">
                        <div>Pickup: {d.pickup_address}{d.pickup_landmark && ` (${d.pickup_landmark})`}</div>
                        <div>Drop-off: {d.dropoff_address}{d.dropoff_landmark && ` (${d.dropoff_landmark})`} · to {d.recipient_name} ({d.recipient_phone})</div>
                        <div>Customer: {d.customer_name} · {d.customer_phone}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold">₦{d.price.toLocaleString()}</span>
                        {nextLabelFor(d) && (
                          <button
                            disabled={busyId === d.id || (d.status === "in_transit" && !d.locker_id && !proofPhotos[d.id])}
                            onClick={() => handleAdvance(d.id, d)}
                            className="text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
                          >
                            {busyId === d.id ? "Updating…" : nextLabelFor(d)}
                          </button>
                        )}
                      </div>
                      {d.status === "in_transit" && !d.locker_id && (
                        <div className="border border-slate-200 rounded-lg p-3 mt-3 bg-paper">
                          <div className="text-xs font-semibold text-ink mb-2">Proof of delivery photo (required)</div>
                          {proofPhotos[d.id] ? (
                            <div className="flex items-center gap-3">
                              <img src={proofPhotos[d.id]} alt="Proof of delivery" className="w-16 h-16 rounded-lg object-cover border border-slate-300" />
                              <label className="text-xs font-semibold text-ink underline cursor-pointer">
                                Retake
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => handleProofPhotoSelected(d.id, e.target.files?.[0])}
                                />
                              </label>
                            </div>
                          ) : (
                            <label className="inline-block text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-2 cursor-pointer">
                              Take photo
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleProofPhotoSelected(d.id, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </div>
                      )}
                      {d.status === "at_locker" && (
                        <div className="border border-route/40 bg-route/10 rounded-lg p-3 mt-3">
                          <div className="text-xs font-semibold text-route-dark mb-1.5">
                            Dropped at locker — awaiting pickup
                          </div>
                          <div className="text-sm text-ink">
                            Slot <span className="font-mono font-semibold">{d.locker_slot}</span>
                            {"  \u00b7  "}
                            Pickup code <span className="font-mono font-semibold text-base">{d.locker_pickup_code}</span>
                          </div>
                          <div className="text-xs text-slate mt-1.5">
                            The customer needs both this code and their tracking code to collect it — share it if they haven't received it already.
                          </div>
                        </div>
                      )}
                      <div className="border-t border-slate-100 mt-3 pt-3">
                        <ShareLocationToggle
                          deliveryId={d.id}
                          token={token}
                          active={["accepted", "picked_up", "in_transit"].includes(d.status)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-6 border-b border-slate-200">
                <TabButton active={rideTab === "available"} onClick={() => setRideTab("available")}>
                  Available ({availableRides.length})
                </TabButton>
                <TabButton active={rideTab === "mine"} onClick={() => setRideTab("mine")}>
                  My rides ({assignedRides.length})
                </TabButton>
              </div>

              {rideError && <p className="text-sm text-signal mb-4">{rideError}</p>}
              {loadingRides ? (
                <p className="text-sm text-slate">Loading…</p>
              ) : rideTab === "available" ? (
                availableRides.length === 0 ? (
                  <EmptyState text="No ride requests right now." />
                ) : (
                  <div className="space-y-3">
                    {availableRides.map((r) => (
                      <div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                        <div>
                          <div className="font-semibold text-sm mb-1">
                            {r.pickup_address} → {r.dropoff_address}
                            {r.distance_km && <span className="text-slate font-normal"> · {r.distance_km} km</span>}
                          </div>
                          <div className="text-xs text-slate">Rider: {r.customer_name} · {r.customer_phone}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-semibold mb-2">₦{r.price.toLocaleString()}</div>
                          <button
                            disabled={busyId === r.id}
                            onClick={() => handleAcceptRide(r.id)}
                            className="text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-2 hover:bg-ink-soft transition-colors disabled:opacity-60"
                          >
                            {busyId === r.id ? "Accepting…" : "Accept ride"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : assignedRides.length === 0 ? (
                <EmptyState text="You haven't accepted any rides yet." />
              ) : (
                <div className="space-y-3">
                  {assignedRides.map((r) => (
                    <div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                      <div className="font-semibold text-sm mb-2">
                        {r.pickup_address} → {r.dropoff_address}
                        {r.distance_km && <span className="text-slate font-normal"> · {r.distance_km} km</span>}
                      </div>
                      <TripStatusStepper steps={RIDE_STEPS} currentKey={r.status} className="mb-3" />
                      <div className="text-xs text-slate mb-3">Rider: {r.customer_name} · {r.customer_phone}</div>
                      {RIDE_ACTIVE_STATUSES.includes(r.status) && r.id === activeRide?.id && (
                        <div className="text-xs text-delivered mb-3 flex items-center gap-1.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
                          </span>
                          Sharing your live location with the rider
                        </div>
                      )}
                      {r.status === "in_progress" && (
                        <div className="mb-3">
                          <RideMeter token={token} rideId={r.id} status={r.status} />
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold">₦{r.price.toLocaleString()}</span>
                        <div className="flex gap-2">
                          {r.status === "accepted" && (
                            <button
                              disabled={busyId === r.id}
                              onClick={() => handleAgentCancelRide(r.id)}
                              className="text-xs font-semibold text-signal hover:text-brand-dark underline disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          )}
                          {RIDE_NEXT_LABEL[r.status] && (
                            <button
                              disabled={busyId === r.id}
                              onClick={() => handleAdvanceRide(r.id)}
                              className="text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
                            >
                              {busyId === r.id ? "Updating…" : RIDE_NEXT_LABEL[r.status]}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, custom }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="text-xs text-slate mb-1">{label}</div>
      {custom || <div className="font-mono font-semibold capitalize">{value}</div>}
    </div>
  );
}

function SectionButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
        active ? "bg-ink text-paper" : "bg-slate-100 text-slate hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ text }) {
  return <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate text-sm">{text}</div>;
}
