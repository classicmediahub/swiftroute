import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useRideLocation } from "../hooks/useRideLocation";
import { enqueueAdvance, flushQueuedAdvances, isNetworkError } from "../lib/offlineQueue";
import RideMeter from "../components/RideMeter";
import TripStatusStepper, { RIDE_STEPS, DELIVERY_STEPS } from "../components/TripStatusStepper";
import StatusBadge from "../components/StatusBadge";
import StarRating from "../components/StarRating";
import ShareLocationToggle from "../components/ShareLocationToggle";
import { SkeletonCardList, SkeletonStatGrid } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Inbox, Package, Car, MessageCircle, Camera, CreditCard } from "lucide-react";
import AgentIdCardModal from "../components/AgentIdCardModal";
import DashboardGreeting from "../components/DashboardGreeting";
import StreakCalendar, { buildStreakDays, nextMilestone } from "../components/StreakCalendar";
import { useStreakMilestone } from "../hooks/useStreakMilestone";
import TripCompleteCelebration from "../components/TripCompleteCelebration";
import Button from "../components/Button";
import ReferralCard from "../components/ReferralCard";
import WithdrawalPanel from "../components/WithdrawalPanel";
import ChatPanel from "../components/ChatPanel";
import EmergencyContactCard from "../components/EmergencyContactCard";
import SOSButton from "../components/SOSButton";
import GasJobsPanel from "../components/GasJobsPanel";
import FoodJobsPanel from "../components/FoodJobsPanel";
import { useUnreadMessages } from "../hooks/useUnreadMessages";

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

// Mirrors backend/routes/deliveries.js's nextStatusFor exactly — needed
// here so an offline "mark delivered" tap can optimistically move the
// stepper forward immediately, instead of just showing a spinner until a
// connection that may not come back for a while.
function nextStatusFor(delivery) {
  if (delivery.status === "accepted") return "picked_up";
  if (delivery.status === "picked_up") return "in_transit";
  if (delivery.status === "in_transit") return delivery.locker_id ? "at_locker" : "delivered";
  return null;
}

// Shrinks a photo to a small square-ish JPEG before it ever reaches the
// server. This one photo string gets embedded in every delivery/ride row
// returned to every customer this agent has ever worked with, so keeping
// it small (a few KB, not a multi-MB phone camera photo) matters far more
// here than it would for a one-off upload.
function resizeImageFile(file, maxDim = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
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
  const [boostEnabled, setBoostEnabled] = useState(Boolean(agentProfile?.boost_enabled));
  const [boostBusy, setBoostBusy] = useState(false);
  const [assigned, setAssigned] = useState([]);
  const [pools, setPools] = useState([]);
  const [poolBusyId, setPoolBusyId] = useState(null);
  const [proofPhotos, setProofPhotos] = useState({}); // deliveryId -> data URL, cleared once submitted
  // Delivery ids with an offline-queued status advance not yet confirmed
  // by the server — drives the "Queued — will sync" badge so an agent
  // isn't left guessing whether their tap actually registered.
  const [pendingSyncIds, setPendingSyncIds] = useState(() => new Set());

  function handleProofPhotoSelected(deliveryId, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProofPhotos((p) => ({ ...p, [deliveryId]: reader.result }));
    reader.readAsDataURL(file);
  }
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Streak — fetched once on mount, not polled, since it only changes at
  // most once a day.
  const [streak, setStreak] = useState(null);
  useEffect(() => {
    api.getStreak(token).then(setStreak).catch(() => {});
  }, [token]);
  const streakDays = streak ? buildStreakDays(streak.current_streak, streak.last_streak_date) : null;
  const streakNextMilestone = streak ? nextMilestone(streak.milestones, streak.current_streak) : null;
  const { celebrating: streakCelebrating, dismiss: dismissStreakCelebration } = useStreakMilestone(
    streak?.current_streak,
    streak?.milestones
  );
  const [error, setError] = useState("");

  const [rideTab, setRideTab] = useState("available");
  const [availableRides, setAvailableRides] = useState([]);
  const [assignedRides, setAssignedRides] = useState([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const [rideError, setRideError] = useState("");
  const [chatOpenKey, setChatOpenKey] = useState(null); // "ride:<id>" or "delivery:<id>" — only one chat open at a time

  const isApproved = agentProfile?.approval_status === "approved";
  const unreadCount = useUnreadMessages(token, isApproved);

  // Rides phase 1: only cab agents broadcast live location. No manual
  // online/offline toggle by design — being on this dashboard, approved,
  // with location permission granted IS being online. Bike/self agents
  // just don't run this at all yet.
  const isLiveRideCandidate = isApproved && agentProfile?.vehicle_type === "cab";
  const isFoodCandidate = isApproved && ["bike", "self"].includes(agentProfile?.vehicle_type);
  const isGasAgent = agentProfile?.vehicle_type === "gas";
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

  // Replays any offline-queued status advances whenever the browser comes
  // back online, and once on mount (covers "reopened the app after being
  // offline" as well as "regained signal mid-session"). A full loadAll()
  // afterward reconciles the optimistic local state with server truth —
  // cheap insurance against any drift.
  const flushQueue = useCallback(async () => {
    await flushQueuedAdvances({
      advanceFn: (id, body) => api.advanceDelivery(token, id, body),
      onSuccess: (item) => {
        setPendingSyncIds((prev) => {
          const next = new Set(prev);
          next.delete(item.deliveryId);
          return next;
        });
      },
      onError: (item, err) => {
        setPendingSyncIds((prev) => {
          const next = new Set(prev);
          next.delete(item.deliveryId);
          return next;
        });
        setError(`A queued update for one delivery couldn't be applied: ${err.message}. Please check its status.`);
      },
    });
    loadAll();
  }, [token, loadAll]);

  useEffect(() => {
    flushQueue(); // in case we reopened the app already back online with a stale queue
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [flushQueue]);

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

  async function handleToggleBoost() {
    const next = !boostEnabled;
    setBoostBusy(true);
    try {
      await api.setAgentBoost(token, next);
      setBoostEnabled(next);
      await loadAll(); // refreshes /available now that visibility rules changed
    } catch (err) {
      alert(err.message);
    } finally {
      setBoostBusy(false);
    }
  }

  useEffect(() => {
    api.myUniformOrder(token).then(setUniformOrder).catch(() => {});
  }, [token]);

  async function handleSubmitUniformSize(size) {
    setUniformSubmitting(true);
    try {
      const updated = await api.submitUniformSize(token, size);
      setUniformOrder(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setUniformSubmitting(false);
    }
  }

  const photoInputRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showAgentIdCard, setShowAgentIdCard] = useState(false);
  const [uniformOrder, setUniformOrder] = useState(null);
  const [uniformSubmitting, setUniformSubmitting] = useState(false);

  async function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-selected later if needed
    if (!file) return;
    setPhotoUploading(true);
    try {
      const resized = await resizeImageFile(file);
      await api.setAgentProfilePhoto(token, resized);
      await refresh();
    } catch (err) {
      alert(err.message || "Couldn't update your photo");
    } finally {
      setPhotoUploading(false);
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
    const body = isFinalDeliveredStep ? { proof_photo: proofPhotos[id] } : undefined;
    setBusyId(id);
    try {
      await api.advanceDelivery(token, id, body);
      setProofPhotos((p) => { const next = { ...p }; delete next[id]; return next; });
      await loadAll();
      await refresh();
    } catch (err) {
      // A genuine connectivity failure — e.g. an agent inside a building
      // with no signal — gets queued instead of shown as an error. The
      // tap still "works" from the agent's point of view: the stepper
      // advances now, and the real request replays the moment signal
      // comes back (see the online-listener effect above).
      if (isNetworkError(err)) {
        await enqueueAdvance(id, body);
        setProofPhotos((p) => { const next = { ...p }; delete next[id]; return next; });
        setPendingSyncIds((prev) => new Set(prev).add(id));
        setAssigned((prev) => prev.map((d) => (d.id === id ? { ...d, status: nextStatusFor(d) } : d)));
      } else {
        alert(err.message);
      }
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
    return (
      <div className="max-w-4xl mx-auto px-5 py-10">
        <SkeletonStatGrid count={4} />
      </div>
    );
  }

  // Built once, right before render, from data already loaded above —
  // not a new fetch. Handles the zero/singular/plural cases explicitly
  // rather than always saying "0 deliveries and 1 rides", which reads as
  // obviously machine-generated the moment either count isn't exactly 1.
  const pendingParts = [];
  if (available.length > 0) pendingParts.push(`${available.length} ${available.length === 1 ? "delivery" : "deliveries"}`);
  if (availableRides.length > 0) pendingParts.push(`${availableRides.length} ${availableRides.length === 1 ? "ride" : "rides"}`);
  const pendingJobsSubtitle =
    pendingParts.length > 0 ? `${pendingParts.join(" and ")} waiting nearby` : "Nothing waiting right now — check back soon";
  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      {streakCelebrating && (
        <TripCompleteCelebration
          trip={{
            id: `streak-${streakCelebrating}`,
            badge: "Streak milestone",
            title: `${streakCelebrating}-day streak!`,
            subtitle: "You've been showing up — keep it going.",
            closeLabel: "Nice!",
          }}
          onClose={dismissStreakCelebration}
        />
      )}
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">AGENT DASHBOARD</div>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={photoUploading}
          className="relative shrink-0 disabled:opacity-60"
          title={user?.profile_photo ? "Change your photo" : "Add a photo — customers see this when you pick up their delivery"}
        >
          {user?.profile_photo ? (
            <img src={user.profile_photo} alt={user.full_name} className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-line" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 border border-slate-200 dark:border-line flex items-center justify-center text-slate dark:text-slate-light font-semibold text-sm">
              {user?.full_name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-route flex items-center justify-center border-2 border-paper dark:border-ink">
            <Camera className="w-2.5 h-2.5 text-ink" />
          </span>
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" capture="user" onChange={handlePhotoSelected} className="hidden" />
        <DashboardGreeting name={user?.full_name} subtitle={pendingJobsSubtitle} />
        <button
          type="button"
          onClick={() => setShowAgentIdCard(true)}
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate dark:text-slate-light border border-slate-300 dark:border-line rounded-full px-3 py-2 hover:text-ink dark:hover:text-paper transition-colors shrink-0"
        >
          <CreditCard className="w-3.5 h-3.5" />
          ID Card
        </button>
        {isLiveRideCandidate && (
          <span className="flex items-center gap-1.5 text-xs font-mono text-slate dark:text-slate-light">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
            </span>
            Visible to riders nearby
          </span>
        )}
      </div>
      {!user?.profile_photo && (
        <p className="text-xs text-slate dark:text-slate-light mb-6 -mt-4">
          <button type="button" onClick={() => photoInputRef.current?.click()} className="underline font-medium">
            Add a profile photo
          </button>
          {" "}— customers see this when you pick up their delivery.
        </p>
      )}

      {uniformOrder?.status === "awaiting_size" && (
        <div className="border border-route bg-route/10 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-ink dark:text-paper mb-1">Select your uniform size</div>
          <p className="text-xs text-slate dark:text-slate-light mb-3">
            Your uniform kit (cloth + cap) has been charged to your wallet — ₦{Number(uniformOrder.amount).toLocaleString()}.
            Pick your cloth size so we can get it made and sent to you.
          </p>
          <div className="flex flex-wrap gap-2">
            {["S", "M", "L", "XL", "XXL"].map((size) => (
              <button
                key={size}
                type="button"
                disabled={uniformSubmitting}
                onClick={() => handleSubmitUniformSize(size)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-line bg-white dark:bg-ink-soft text-sm font-semibold hover:border-ink dark:hover:border-paper transition-colors disabled:opacity-50"
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
      {uniformOrder && uniformOrder.status !== "awaiting_size" && (
        <div className="flex items-center gap-2 text-xs text-slate dark:text-slate-light mb-6 -mt-2">
          <span className="font-medium">Uniform ({uniformOrder.cloth_size}):</span>
          <span className={`font-semibold px-2 py-0.5 rounded-full ${
            uniformOrder.status === "delivered" ? "bg-delivered/15 text-delivered" :
            uniformOrder.status === "shipped" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
          }`}>
            {uniformOrder.status === "pending" ? "Being prepared" : uniformOrder.status === "shipped" ? "Shipped" : "Delivered"}
          </span>
        </div>
      )}

      {streak && streakDays && (
        <StreakCalendar
          days={streakDays}
          currentStreak={streak.current_streak}
          longestStreak={streak.longest_streak}
          nextMilestoneInfo={streakNextMilestone}
          className="mb-8"
        />
      )}

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
                <span className="font-mono text-xs text-slate dark:text-slate-light">{Number(agentProfile.rating).toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-xs text-slate dark:text-slate-light">No reviews yet</span>
            )
          }
        />
        <SummaryCard label="Wallet balance" value={`₦${agentProfile.wallet_balance.toLocaleString()}`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <WithdrawalPanel token={token} agentProfile={agentProfile} onChanged={refresh} />
        <ReferralCard token={token} role="agent" />
        <EmergencyContactCard token={token} />
      </div>

      {!isApproved ? (
        <div className="border border-signal/40 bg-signal/10 rounded-2xl p-6 text-ink dark:text-paper">
          <h2 className="font-display font-semibold mb-1 text-signal">Your application is under review</h2>
          <p className="text-sm">
            An admin needs to approve your agent profile before you can see and accept deliveries. This usually
            takes a short while — check back soon.
          </p>
        </div>
      ) : isGasAgent ? (
        <GasJobsPanel token={token} />
      ) : (
        <>
          {/* Deliveries vs Rides vs Food — Rides only for cab agents, Food
              only for bike/self agents (see decision to reuse the
              delivery agent pool rather than a dedicated food agent
              type). A cab agent never sees Food; a bike/self agent
              never sees Rides. */}
          {(isLiveRideCandidate || isFoodCandidate) && (
            <div className="flex gap-2 mb-4">
              <SectionButton active={section === "deliveries"} onClick={() => setSection("deliveries")}>
                Deliveries
              </SectionButton>
              {isLiveRideCandidate && (
                <SectionButton active={section === "rides"} onClick={() => setSection("rides")}>
                  Rides ({availableRides.length})
                </SectionButton>
              )}
              {isFoodCandidate && (
                <SectionButton active={section === "food"} onClick={() => setSection("food")}>
                  Food
                </SectionButton>
              )}
            </div>
          )}

          {section === "deliveries" ? (
            <>
              <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
                <TabButton active={tab === "available"} onClick={() => setTab("available")}>
                  Available ({available.length})
                </TabButton>
                <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
                  My deliveries ({assigned.length})
                  {unreadCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-signal text-white text-[10px] font-semibold align-middle">
                      {unreadCount}
                    </span>
                  )}
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
                        <div className="text-xs text-slate dark:text-slate-light mt-0.5">
                          Accept once to take the whole group as a single trip.
                        </div>
                      </div>
                      <button
                        disabled={poolBusyId === p.pool_id}
                        onClick={() => handleAcceptPool(p.pool_id)}
                        className="shrink-0 text-xs font-semibold bg-route hover:bg-route-dark text-ink dark:text-paper rounded-lg px-3.5 py-2.5 transition-colors disabled:opacity-60"
                      >
                        {poolBusyId === p.pool_id ? "Accepting…" : `Accept pool (${p.member_count})`}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {loading ? (
                <SkeletonCardList count={2} />
              ) : tab === "available" ? (
                <>
                  <div className="flex items-center justify-between gap-3 border border-slate-200 dark:border-line rounded-xl p-3.5 mb-4 bg-white dark:bg-ink-soft">
                    <div>
                      <div className="text-sm font-semibold">Job Boost</div>
                      <div className="text-xs text-slate dark:text-slate-light mt-0.5">
                        See new jobs before other agents. Free to enable — a ₦150 fee only applies if you claim one in its first minute.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleBoost}
                      disabled={boostBusy}
                      className={`shrink-0 relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${boostEnabled ? "bg-route" : "bg-slate-300 dark:bg-line"}`}
                      aria-pressed={boostEnabled}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${boostEnabled ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                  {available.length === 0 ? (
                    <EmptyState icon={Package} title="Nothing available right now" description="No pending deliveries match your vehicle type at the moment — check back soon." className="border border-dashed border-slate-300 dark:border-line rounded-2xl" />
                  ) : (
                    <div className="space-y-3">
                      {available.map((d) => (
                        <div key={d.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft flex items-start justify-between gap-4">
                          <div>
                            <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{d.tracking_code}</div>
                            <div className="font-semibold text-sm mb-1">
                              {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                              {d.distance_km && <span className="text-slate dark:text-slate-light font-normal"> · {d.distance_km} km</span>}
                            </div>
                            <div className="text-xs text-slate dark:text-slate-light space-y-0.5">
                              <div>Pickup: {d.pickup_address}{d.pickup_landmark && ` (${d.pickup_landmark})`}</div>
                              <div>Drop-off: {d.dropoff_address}{d.dropoff_landmark && ` (${d.dropoff_landmark})`}</div>
                              <div>Customer: {d.customer_name} · {d.customer_phone}</div>
                            </div>
                            {d.boost_fee_applies && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 mt-1.5">
                                Early access · ₦150 boost fee · public in {d.boost_seconds_remaining}s
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-semibold mb-2">₦{d.price.toLocaleString()}</div>
                            <Button
                              variant="dark"
                              size="sm"
                              className="dark:bg-route dark:text-ink"
                              loading={busyId === d.id}
                              loadingText="Accepting…"
                              onClick={() => handleAccept(d.id)}
                            >
                              {d.boost_fee_applies ? "Accept (₦150 fee)" : "Accept job"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : assigned.length === 0 ? (
                <EmptyState icon={Inbox} title="No deliveries accepted yet" description="Deliveries you accept from the Available tab will show up here." className="border border-dashed border-slate-300 dark:border-line rounded-2xl" />
              ) : (
                <div className="space-y-3">
                  {assigned.map((d) => (
                    <div key={d.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-mono text-xs text-slate dark:text-slate-light mb-1">{d.tracking_code}</div>
                          <div className="font-semibold text-sm">
                          {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                          {d.distance_km && <span className="text-slate dark:text-slate-light font-normal"> · {d.distance_km} km</span>}
                        </div>
                        </div>
                      </div>
                      <TripStatusStepper steps={DELIVERY_STEPS} currentKey={d.status} className="mb-3" />
                      {pendingSyncIds.has(d.id) && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          No connection — saved on this device, will sync automatically once you're back online
                        </div>
                      )}
                      <div className="text-xs text-slate dark:text-slate-light space-y-0.5 mb-3">
                        <div>Pickup: {d.pickup_address}{d.pickup_landmark && ` (${d.pickup_landmark})`}</div>
                        <div>Drop-off: {d.dropoff_address}{d.dropoff_landmark && ` (${d.dropoff_landmark})`} · to {d.recipient_name} ({d.recipient_phone})</div>
                        <div>Customer: {d.customer_name} · {d.customer_phone}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold">₦{d.price.toLocaleString()}</span>
                        {nextLabelFor(d) && !pendingSyncIds.has(d.id) && (
                          <Button
                            size="sm"
                            disabled={d.status === "in_transit" && !d.locker_id && !proofPhotos[d.id]}
                            loading={busyId === d.id}
                            loadingText="Updating…"
                            onClick={() => handleAdvance(d.id, d)}
                          >
                            {nextLabelFor(d)}
                          </Button>
                        )}
                      </div>
                      {d.status === "in_transit" && !d.locker_id && (
                        <div className="border border-slate-200 dark:border-line rounded-lg p-3 mt-3 bg-paper">
                          <div className="text-xs font-semibold text-ink dark:text-paper mb-2">Proof of delivery photo (required)</div>
                          {proofPhotos[d.id] ? (
                            <div className="flex items-center gap-3">
                              <img src={proofPhotos[d.id]} alt="Proof of delivery" className="w-16 h-16 rounded-lg object-cover border border-slate-300" />
                              <label className="text-xs font-semibold text-ink dark:text-paper underline cursor-pointer">
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
                            <label className="inline-block text-xs font-semibold bg-ink text-paper dark:bg-route dark:text-ink rounded-lg px-3 py-2 cursor-pointer">
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
                          <div className="text-sm text-ink dark:text-paper">
                            Slot <span className="font-mono font-semibold">{d.locker_slot}</span>
                            {"  \u00b7  "}
                            Pickup code <span className="font-mono font-semibold text-base">{d.locker_pickup_code}</span>
                          </div>
                          <div className="text-xs text-slate dark:text-slate-light mt-1.5">
                            The customer needs both this code and their tracking code to collect it — share it if they haven't received it already.
                          </div>
                        </div>
                      )}
                      <div className="border-t border-slate-100 mt-3 pt-3 flex items-center justify-between">
                        <ShareLocationToggle
                          deliveryId={d.id}
                          token={token}
                          active={["accepted", "picked_up", "in_transit"].includes(d.status)}
                        />
                        <button
                          onClick={() => setChatOpenKey(chatOpenKey === `delivery:${d.id}` ? null : `delivery:${d.id}`)}
                          className="flex items-center gap-1 text-xs font-semibold text-route-dark hover:underline shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {chatOpenKey === `delivery:${d.id}` ? "Hide chat" : "Message customer"}
                        </button>
                      </div>
                      {chatOpenKey === `delivery:${d.id}` && (
                        <div className="mt-3">
                          <ChatPanel
                            token={token}
                            tripType="delivery"
                            tripId={d.id}
                            myRole="agent"
                            otherPartyName={d.customer_name}
                            disabled={d.status === "cancelled"}
                          />
                        </div>
                      )}
                      {["accepted", "picked_up", "in_transit"].includes(d.status) && (
                        <div className="mt-3">
                          <SOSButton token={token} tripType="delivery" tripId={d.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : section === "rides" ? (
            <>
              <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
                <TabButton active={rideTab === "available"} onClick={() => setRideTab("available")}>
                  Available ({availableRides.length})
                </TabButton>
                <TabButton active={rideTab === "mine"} onClick={() => setRideTab("mine")}>
                  My rides ({assignedRides.length})
                  {unreadCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-signal text-white text-[10px] font-semibold align-middle">
                      {unreadCount}
                    </span>
                  )}
                </TabButton>
              </div>

              {rideError && <p className="text-sm text-signal mb-4">{rideError}</p>}
              {loadingRides ? (
                <SkeletonCardList count={2} />
              ) : rideTab === "available" ? (
                availableRides.length === 0 ? (
                  <EmptyState icon={Car} title="No ride requests right now" description="New ride requests near you will appear here as they come in." className="border border-dashed border-slate-300 dark:border-line rounded-2xl" />
                ) : (
                  <div className="space-y-3">
                    {availableRides.map((r) => (
                      <div key={r.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft flex items-start justify-between gap-4">
                        <div>
                          <div className="font-semibold text-sm mb-1">
                            {r.pickup_address} → {r.dropoff_address}
                            {r.distance_km && <span className="text-slate dark:text-slate-light font-normal"> · {r.distance_km} km</span>}
                          </div>
                          <div className="text-xs text-slate dark:text-slate-light">Rider: {r.customer_name} · {r.customer_phone}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-semibold mb-2">₦{r.price.toLocaleString()}</div>
                          <Button
                            variant="dark"
                            size="sm"
                            className="dark:bg-route dark:text-ink"
                            loading={busyId === r.id}
                            loadingText="Accepting…"
                            onClick={() => handleAcceptRide(r.id)}
                          >
                            Accept ride
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : assignedRides.length === 0 ? (
                <EmptyState icon={Inbox} title="No rides accepted yet" description="Rides you accept from the Available tab will show up here." className="border border-dashed border-slate-300 dark:border-line rounded-2xl" />
              ) : (
                <div className="space-y-3">
                  {assignedRides.map((r) => (
                    <div key={r.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft">
                      <div className="font-semibold text-sm mb-2">
                        {r.pickup_address} → {r.dropoff_address}
                        {r.distance_km && <span className="text-slate dark:text-slate-light font-normal"> · {r.distance_km} km</span>}
                      </div>
                      <TripStatusStepper steps={RIDE_STEPS} currentKey={r.status} className="mb-3" />
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-slate dark:text-slate-light">Rider: {r.customer_name} · {r.customer_phone}</div>
                        <button
                          onClick={() => setChatOpenKey(chatOpenKey === `ride:${r.id}` ? null : `ride:${r.id}`)}
                          className="flex items-center gap-1 text-xs font-semibold text-route-dark hover:underline shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {chatOpenKey === `ride:${r.id}` ? "Hide chat" : "Message rider"}
                        </button>
                      </div>
                      {chatOpenKey === `ride:${r.id}` && (
                        <div className="mb-3">
                          <ChatPanel
                            token={token}
                            tripType="ride"
                            tripId={r.id}
                            myRole="agent"
                            otherPartyName={r.customer_name}
                            disabled={r.status === "cancelled"}
                          />
                        </div>
                      )}
                      {RIDE_ACTIVE_STATUSES.includes(r.status) && (
                        <div className="mb-3">
                          <SOSButton token={token} tripType="ride" tripId={r.id} />
                        </div>
                      )}
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
                            <Button
                              size="sm"
                              loading={busyId === r.id}
                              loadingText="Updating…"
                              onClick={() => handleAdvanceRide(r.id)}
                            >
                              {RIDE_NEXT_LABEL[r.status]}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <FoodJobsPanel token={token} />
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, custom }) {
  return (
    <div className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft">
      <div className="text-xs text-slate dark:text-slate-light mb-1">{label}</div>
      {custom || <div className="font-mono font-semibold capitalize">{value}</div>}
      {showAgentIdCard && (
        <AgentIdCardModal user={user} agentProfile={agentProfile} onClose={() => setShowAgentIdCard(false)} />
      )}
    </div>
  );
}

function SectionButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
        active ? "bg-ink text-paper dark:bg-route dark:text-ink" : "bg-slate-100 dark:bg-white/10 text-slate dark:text-slate-light hover:bg-slate-200"
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
        active ? "border-ink text-ink dark:text-paper" : "border-transparent text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper dark:text-paper"
      }`}
    >
      {children}
    </button>
  );
}

