import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import { Field, inputClass } from "../components/AuthLayout";
import StarRating from "../components/StarRating";
import ReviewForm from "../components/ReviewForm";
import WalletPanel from "../components/WalletPanel";
import BulkUpload from "../components/BulkUpload";
import Invoices from "../components/Invoices";
import Reports from "../components/Reports";
import ApiSettings from "../components/ApiSettings";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { Package } from "lucide-react";
import DashboardGreeting from "../components/DashboardGreeting";
import StreakCalendar, { buildStreakDays, nextMilestone } from "../components/StreakCalendar";
import { useStreakMilestone } from "../hooks/useStreakMilestone";
import TripCompleteCelebration from "../components/TripCompleteCelebration";
import { useCelebrateOnComplete } from "../hooks/useCelebrateOnComplete";
import Button from "../components/Button";
import { lazy, Suspense } from "react";
const DeliveryMap = lazy(() => import("../components/DeliveryMap"));
const PinMap = lazy(() => import("../components/PinMap"));

const CITIES = ["Lagos", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];
const PACKAGE_TYPES = ["Documents", "Small parcel", "Food", "Electronics", "Fragile item", "Other"];
const VEHICLES = [
  { value: "any", label: "Any available" },
  { value: "self", label: "Self" },
  { value: "bike", label: "Bike" },
  { value: "cab", label: "Cab" },
];

const emptyForm = {
  package_type: "Documents", package_note: "",
  is_return: false, original_delivery_id: "", return_reason: "",
  pickup_address: "", pickup_city: "Lagos", pickup_landmark: "", pickup_coords: null,
  dropoff_address: "", dropoff_city: "Lagos", dropoff_landmark: "", dropoff_coords: null,
  recipient_name: "", recipient_phone: "",
  preferred_vehicle: "any", payment_method: "paystack",
  institution_id: "", pickup_landmark_id: "", dropoff_landmark_id: "",
  dropoff_locker_id: "",
  pool_delivery: false,
  guaranteed: false,
  elite_requested: false,
  declared_value: "",
};

export default function CustomerDashboard() {
  const { token, user } = useAuth();
  const isBusiness = user?.account_type === "business";
  const [tab, setTab] = useState("send");

  const [form, setForm] = useState(emptyForm);
  const [estimate, setEstimate] = useState(null);
  const [estimateDistance, setEstimateDistance] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  // Campus/institution delivery mode — an alternative to typing a
  // free-text address, for institutions we have pre-mapped landmarks for
  // (see backend/seed-landmarks.js). Off by default; nothing here affects
  // the normal address-based flow unless a customer explicitly opts in.
  const [campusMode, setCampusMode] = useState(false);
  const [institutions, setInstitutions] = useState([]);
  const [landmarks, setLandmarks] = useState([]);
  const [pendingLandmarks, setPendingLandmarks] = useState([]);
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestName, setSuggestName] = useState("");
  const [suggestZone, setSuggestZone] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestStatus, setSuggestStatus] = useState("");
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [claimFormOpenId, setClaimFormOpenId] = useState(null);
  const [claimReason, setClaimReason] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimStatus, setClaimStatus] = useState({}); // deliveryId -> message shown inline

  async function handleFileClaim(deliveryId) {
    if (!claimReason.trim() || !claimAmount || Number(claimAmount) <= 0) return;
    setClaimSubmitting(true);
    try {
      await api.fileClaim(token, deliveryId, { reason: claimReason.trim(), claim_amount: Number(claimAmount) });
      setClaimStatus((s) => ({ ...s, [deliveryId]: "Claim submitted — our team will review it shortly." }));
      setClaimFormOpenId(null);
      setClaimReason("");
      setClaimAmount("");
    } catch (err) {
      setClaimStatus((s) => ({ ...s, [deliveryId]: err.message }));
    } finally {
      setClaimSubmitting(false);
    }
  }
  const [confirmError, setConfirmError] = useState("");

  // Locker delivery — a separate, mutually-exclusive mode from campus
  // mode (see toggleLockerMode/toggleCampusMode). Only affects the
  // DROP-OFF side; pickup is always the normal address fields regardless.
  const [lockerMode, setLockerMode] = useState(false);
  const [lockerLocationType, setLockerLocationType] = useState("campus"); // "campus" | "city"
  const [lockerInstitutionId, setLockerInstitutionId] = useState("");
  const [lockerCity, setLockerCity] = useState("Lagos");
  const [lockers, setLockers] = useState([]);
  const selectedLocker = lockers.find((l) => l.id === form.dropoff_locker_id) || null;

  useEffect(() => {
    api.listInstitutions(token).then(setInstitutions).catch(() => setInstitutions([]));
  }, [token]);

  useEffect(() => {
    if (!form.institution_id) { setLandmarks([]); return; }
    api.listLandmarks(token, form.institution_id).then(setLandmarks).catch(() => setLandmarks([]));
  }, [token, form.institution_id]);

  useEffect(() => {
    if (!form.institution_id) { setPendingLandmarks([]); return; }
    api.listPendingLandmarks(token, form.institution_id).then(setPendingLandmarks).catch(() => setPendingLandmarks([]));
  }, [token, form.institution_id]);

  useEffect(() => {
    if (!lockerMode) { setLockers([]); return; }
    if (lockerLocationType === "campus" && !lockerInstitutionId) { setLockers([]); return; }
    const params = lockerLocationType === "campus" ? { institutionId: lockerInstitutionId } : { city: lockerCity };
    api.listLockers(token, params).then(setLockers).catch(() => setLockers([]));
  }, [token, lockerMode, lockerLocationType, lockerInstitutionId, lockerCity]);

  function toggleCampusMode() {
    setCampusMode((v) => !v);
    setLockerMode(false); // mutually exclusive — see lockers.js's scope note
    setEstimate(null);
    setEstimateDistance(null);
    setShowSuggestForm(false);
    setSuggestStatus("");
    setConfirmError("");
    setForm((f) => ({
      ...f,
      institution_id: "", pickup_landmark_id: "", dropoff_landmark_id: "",
      dropoff_locker_id: "", pool_delivery: false,
      pickup_address: "", dropoff_address: "", pickup_coords: null, dropoff_coords: null,
    }));
  }

  function toggleLockerMode() {
    setLockerMode((v) => !v);
    setCampusMode(false); // mutually exclusive
    setEstimate(null);
    setEstimateDistance(null);
    setForm((f) => ({
      ...f,
      institution_id: "", pickup_landmark_id: "", dropoff_landmark_id: "",
      dropoff_locker_id: "",
      dropoff_address: "", dropoff_coords: null,
    }));
  }

  async function handleSuggestLandmark(e) {
    e.preventDefault();
    if (!suggestName.trim()) return;
    setSuggestSubmitting(true);
    setSuggestStatus("");
    try {
      await api.submitLandmark(token, {
        institution_id: form.institution_id,
        name: suggestName.trim(),
        zone: suggestZone.trim() || undefined,
        note: suggestNote.trim() || undefined,
      });
      setSuggestStatus("Thanks! Your landmark is pending confirmation from other users.");
      setSuggestName(""); setSuggestZone(""); setSuggestNote("");
      api.listPendingLandmarks(token, form.institution_id).then(setPendingLandmarks).catch(() => {});
    } catch (err) {
      setSuggestStatus(err.message);
    } finally {
      setSuggestSubmitting(false);
    }
  }

  async function handleConfirmLandmark(submissionId) {
    setConfirmingId(submissionId);
    setConfirmError("");
    try {
      const result = await api.confirmLandmark(token, submissionId);
      if (result.promoted) {
        // newly-usable landmark — refresh the real dropdown options so it's immediately selectable
        api.listLandmarks(token, form.institution_id).then(setLandmarks).catch(() => {});
      }
      setPendingLandmarks((prev) => prev.filter((p) => p.id !== submissionId));
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  function preventEnterSubmit(e) {
    if (e.key === "Enter") e.preventDefault(); // these inputs live inside the main delivery form — Enter shouldn't trigger it
  }

  const refreshWallet = useCallback(() => {
    api.getWallet(token).then((w) => setWalletBalance(w.balance)).catch(() => {});
  }, [token]);

  useEffect(() => { refreshWallet(); }, [refreshWallet]);

  // Streak — fetched once on mount, not polled, since it only changes at
  // most once a day (a new delivery/ride today doesn't move the needle
  // again until tomorrow), unlike deliveries which poll every 8s above.
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

  const loadDeliveries = useCallback(async () => {
    try {
      const rows = await api.myDeliveries(token);
      setDeliveries(rows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);

  // Fires the confetti overlay exactly once, the first time a delivery is
  // observed as 'delivered' — not on every subsequent poll of an already-
  // delivered parcel. Returns (is_return) deliveries are excluded from the
  // celebration on purpose: a return trip completing isn't the "your
  // parcel arrived!" moment this screen is meant to mark.
  const { celebrating, dismiss: dismissCelebration } = useCelebrateOnComplete(deliveries, {
    getId: (d) => d.id,
    getStatus: (d) => (d.is_return ? "return" : d.status),
    completedStatuses: ["delivered"],
    toCelebration: (d) => ({
      id: d.id,
      badge: "Delivered",
      title: "Parcel delivered!",
      subtitle: `${d.pickup_address} → ${d.dropoff_address}`,
      stats: [
        { label: "Tracking code", value: d.tracking_code },
        { label: "Distance", value: d.distance_km ? `${d.distance_km} km` : "—" },
      ],
      price: d.price,
      priceLabel: "Delivery cost",
      closeLabel: "Great!",
    }),
  });

  // Poll for updates while at least one delivery is actively moving, so the
  // agent's live position and status stay reasonably fresh without the
  // customer needing to manually refresh.
  useEffect(() => {
    const hasActive = deliveries.some((d) => ["accepted", "picked_up", "in_transit"].includes(d.status));
    if (!hasActive) return;
    const t = setInterval(loadDeliveries, 8000);
    return () => clearInterval(t);
  }, [deliveries, loadDeliveries]);

  useEffect(() => {
    if (campusMode) return; // campus mode has its own estimate effect below
    if (lockerMode && !selectedLocker) return; // nothing picked yet
    const effectiveDropoffCity = lockerMode ? selectedLocker.city : form.dropoff_city;
    if (!form.pickup_city || !effectiveDropoffCity) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.estimate(token, {
          pickup_city: form.pickup_city,
          dropoff_city: effectiveDropoffCity,
          preferred_vehicle: form.preferred_vehicle,
          // Only send addresses once they're reasonably complete — avoids
          // geocoding "1" or "12 A" while the person is still typing.
          // Locker mode skips address entirely — this is only a city-based
          // preview; the actual charged price is computed server-side from
          // the locker's real coordinates at creation time, so it may be
          // slightly more accurate than what's previewed here.
          pickup_address: form.pickup_address.trim().length > 5 ? form.pickup_address : undefined,
          dropoff_address: lockerMode ? undefined : (form.dropoff_address.trim().length > 5 ? form.dropoff_address : undefined),
        });
        setEstimate(res.price);
        setEstimateDistance(res.distanceKm);
      } catch {
        setEstimate(null);
        setEstimateDistance(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [campusMode, lockerMode, selectedLocker, form.pickup_city, form.dropoff_city, form.pickup_address, form.dropoff_address, form.preferred_vehicle, token]);

  // Campus mode: no geocoding at all — just a direct lookup against the
  // pre-computed landmark_distances table, so it's instant and can never
  // fail the way address geocoding sometimes does.
  useEffect(() => {
    if (!campusMode) return;
    const { institution_id, pickup_landmark_id, dropoff_landmark_id } = form;
    if (!institution_id || !pickup_landmark_id || !dropoff_landmark_id || pickup_landmark_id === dropoff_landmark_id) {
      setEstimate(null);
      setEstimateDistance(null);
      return;
    }
    let cancelled = false;
    api.estimateCampus(token, {
      institution_id, pickup_landmark_id, dropoff_landmark_id,
      preferred_vehicle: form.preferred_vehicle,
    }).then((res) => {
      if (cancelled) return;
      setEstimate(res.price);
      setEstimateDistance(res.distanceKm);
    }).catch(() => {
      if (!cancelled) { setEstimate(null); setEstimateDistance(null); }
    });
    return () => { cancelled = true; };
  }, [campusMode, form.institution_id, form.pickup_landmark_id, form.dropoff_landmark_id, form.preferred_vehicle, token]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // A price came back (estimate !== null) but with no real distance
  // (estimateDistance === null) means quote.js fell back to the flat
  // city-rate estimate — almost always because it couldn't geocode one or
  // both addresses. That's the signal to nudge the customer toward
  // pinning the exact location instead of relying on address lookup.
  const addressLookupFailed = estimate !== null && estimateDistance === null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.createDelivery(token, form);
      if (data.authorization_url) {
        // Full-page redirect to Paystack's hosted checkout. Don't reset
        // submitting/state here — the browser is about to navigate away.
        window.location.href = data.authorization_url;
        return;
      }
      // Wallet payments land here — no redirect, already paid instantly.
      setForm(emptyForm);
      setEstimate(null);
      setEstimateDistance(null);
      await loadDeliveries();
      refreshWallet();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryPayment(id) {
    try {
      const data = await api.retryPayment(token, id);
      window.location.href = data.authorization_url;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCancel(id) {
    try {
      await api.cancelDelivery(token, id);
      await loadDeliveries();
      refreshWallet();
    } catch (err) {
      alert(err.message);
    }
  }

  const sendDeliveryView = (
    <div className="grid lg:grid-cols-5 gap-8">
      <div className="lg:col-span-2">
        <WalletPanel token={token} />
        <form onSubmit={handleSubmit} className="border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft h-fit">
          <Field label="What are you sending?">
            <select className={inputClass} value={form.package_type} onChange={(e) => update("package_type", e.target.value)}>
              {PACKAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Note for the agent (optional)">
            <input className={inputClass} value={form.package_note} onChange={(e) => update("package_note", e.target.value)} placeholder="Fragile — handle with care" />
          </Field>

          <label className="flex items-start gap-2.5 border border-slate-200 dark:border-line rounded-lg p-3.5 mb-4 bg-paper cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_return}
              onChange={(e) => setForm((f) => ({ ...f, is_return: e.target.checked, original_delivery_id: "", return_reason: "" }))}
              className="mt-0.5"
            />
            <span className="text-sm text-ink dark:text-paper">
              This is a return
              <span className="block text-xs text-slate dark:text-slate-light mt-0.5">
                Picking something up to send back — set pickup to the customer's location and drop-off to yours below.
              </span>
            </span>
          </label>

          {form.is_return && (
            <div className="border border-slate-200 dark:border-line rounded-lg p-3.5 mb-4 bg-paper space-y-2">
              {deliveries.filter((d) => d.status === "delivered" && !d.is_return).length > 0 && (
                <Field label="Which order is this a return for? (optional)">
                  <select
                    className={inputClass}
                    value={form.original_delivery_id}
                    onChange={(e) => update("original_delivery_id", e.target.value)}
                  >
                    <option value="">Not linked to a specific order</option>
                    {deliveries.filter((d) => d.status === "delivered" && !d.is_return).map((d) => (
                      <option key={d.id} value={d.id}>{d.tracking_code} · {d.pickup_city} → {d.dropoff_city}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Reason for return (optional)">
                <input
                  className={inputClass}
                  value={form.return_reason}
                  onChange={(e) => update("return_reason", e.target.value)}
                  placeholder="e.g. Wrong size, item damaged"
                />
              </Field>
            </div>
          )}

          {institutions.length > 0 && (
            <button
              type="button"
              onClick={toggleCampusMode}
              className={`w-full text-left text-sm font-medium rounded-lg px-3.5 py-2.5 border mb-2 transition-colors ${
                campusMode ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 hover:border-slate-400 text-ink dark:text-paper"
              }`}
            >
              {campusMode ? "✓ Delivering within a campus" : "Delivering within a campus?"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleLockerMode}
            className={`w-full text-left text-sm font-medium rounded-lg px-3.5 py-2.5 border mb-4 transition-colors ${
              lockerMode ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 hover:border-slate-400 text-ink dark:text-paper"
            }`}
          >
            {lockerMode ? "✓ Deliver to a locker" : "Deliver to a locker?"}
          </button>

          {campusMode ? (
            <>
              <Field label="Institution">
                <select
                  required={campusMode}
                  className={inputClass}
                  value={form.institution_id}
                  onChange={(e) => setForm((f) => ({ ...f, institution_id: e.target.value, pickup_landmark_id: "", dropoff_landmark_id: "" }))}
                >
                  <option value="">Select an institution…</option>
                  {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Pickup landmark">
                  <select
                    required={campusMode}
                    disabled={!form.institution_id}
                    className={inputClass}
                    value={form.pickup_landmark_id}
                    onChange={(e) => update("pickup_landmark_id", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {landmarks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <Field label="Drop-off landmark">
                  <select
                    required={campusMode}
                    disabled={!form.institution_id}
                    className={inputClass}
                    value={form.dropoff_landmark_id}
                    onChange={(e) => update("dropoff_landmark_id", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {landmarks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              </div>
              {form.pickup_landmark_id && form.pickup_landmark_id === form.dropoff_landmark_id && (
                <p className="text-xs text-signal mb-4">Pickup and drop-off landmarks can't be the same.</p>
              )}

              {form.institution_id && form.pickup_landmark_id && form.dropoff_landmark_id && (
                <label className="flex items-start gap-2.5 border border-slate-200 dark:border-line rounded-lg p-3.5 mb-4 bg-paper cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pool_delivery}
                    onChange={(e) => setForm((f) => ({
                      ...f, pool_delivery: e.target.checked,
                      guaranteed: e.target.checked ? false : f.guaranteed,
                      elite_requested: e.target.checked ? false : f.elite_requested,
                      declared_value: e.target.checked ? "" : f.declared_value,
                    }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-ink dark:text-paper">
                    Pool this delivery to save
                    <span className="block text-xs text-slate dark:text-slate-light mt-0.5">
                      Share your trip with others delivering to this campus around the same time — up to 20% off.
                      If more people join after you order, you'll be refunded the difference straight to your
                      wallet automatically. The price shown below doesn't include this discount yet, since it
                      depends on who else joins.
                    </span>
                  </span>
                </label>
              )}

              {form.institution_id && (
                <div className="border border-slate-200 dark:border-line rounded-lg p-3.5 mb-4 bg-paper">
                  <button
                    type="button"
                    onClick={() => setShowSuggestForm((v) => !v)}
                    className="text-xs font-semibold text-ink dark:text-paper underline"
                  >
                    {showSuggestForm ? "Cancel suggestion" : "Can't find your landmark? Suggest one"}
                  </button>

                  {showSuggestForm && (
                    <div className="mt-3 space-y-2">
                      <input
                        className={inputClass}
                        placeholder="Landmark name (e.g. New Cafeteria Block)"
                        value={suggestName}
                        onChange={(e) => setSuggestName(e.target.value)}
                        onKeyDown={preventEnterSubmit}
                      />
                      <input
                        className={inputClass}
                        placeholder="Zone (optional — e.g. Dining, Academic)"
                        value={suggestZone}
                        onChange={(e) => setSuggestZone(e.target.value)}
                        onKeyDown={preventEnterSubmit}
                      />
                      <input
                        className={inputClass}
                        placeholder="Note (optional — help others recognize it)"
                        value={suggestNote}
                        onChange={(e) => setSuggestNote(e.target.value)}
                        onKeyDown={preventEnterSubmit}
                      />
                      <button
                        type="button"
                        onClick={handleSuggestLandmark}
                        disabled={suggestSubmitting || !suggestName.trim()}
                        className="text-xs font-semibold bg-ink text-paper dark:bg-route dark:text-ink rounded-lg px-3 py-1.5 disabled:opacity-60"
                      >
                        {suggestSubmitting ? "Submitting…" : "Submit landmark"}
                      </button>
                      {suggestStatus && <p className="text-xs text-slate dark:text-slate-light mt-1.5">{suggestStatus}</p>}
                    </div>
                  )}

                  {pendingLandmarks.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-line">
                      <div className="text-xs font-semibold text-ink dark:text-paper mb-2">Help verify landmarks near you</div>
                      <div className="space-y-2">
                        {pendingLandmarks.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-ink-soft border border-slate-200 dark:border-line rounded-lg px-3 py-2">
                            <div>
                              <div className="font-medium text-ink dark:text-paper">{p.name}</div>
                              {p.note && <div className="text-slate dark:text-slate-light">{p.note}</div>}
                              <div className="text-slate-light mt-0.5">{p.confirmation_count} of 3 confirmations</div>
                            </div>
                            <Button
                              size="sm"
                              loading={confirmingId === p.id}
                              loadingText="…"
                              onClick={() => handleConfirmLandmark(p.id)}
                              className="shrink-0"
                            >
                              Confirm
                            </Button>
                          </div>
                        ))}
                      </div>
                      {confirmError && <p className="text-xs text-signal mt-2">{confirmError}</p>}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Pickup address">
                  <input required className={inputClass} value={form.pickup_address} onChange={(e) => update("pickup_address", e.target.value)} placeholder="12 Allen Ave" />
                </Field>
                <Field label="Pickup city">
                  <select className={inputClass} value={form.pickup_city} onChange={(e) => update("pickup_city", e.target.value)}>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Pickup landmark (optional)">
                <input className={inputClass} value={form.pickup_landmark} onChange={(e) => update("pickup_landmark", e.target.value)} placeholder="Opposite First Bank, blue gate" />
              </Field>
              <Suspense fallback={null}>
                <PinMap
                  token={token}
                  address={form.pickup_address}
                  city={form.pickup_city}
                  coords={form.pickup_coords}
                  onCoordsChange={(c) => update("pickup_coords", c)}
                  suggestOpen={addressLookupFailed}
                />
              </Suspense>

              {lockerMode ? (
                <div className="border border-slate-200 dark:border-line rounded-lg p-3.5 mb-4 bg-paper">
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => { setLockerLocationType("campus"); update("dropoff_locker_id", ""); }}
                      className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${
                        lockerLocationType === "campus" ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 text-ink dark:text-paper"
                      }`}
                    >
                      On a campus
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLockerLocationType("city"); update("dropoff_locker_id", ""); }}
                      className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${
                        lockerLocationType === "city" ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 text-ink dark:text-paper"
                      }`}
                    >
                      In the city
                    </button>
                  </div>

                  {lockerLocationType === "campus" ? (
                    <Field label="Institution">
                      <select
                        className={inputClass}
                        value={lockerInstitutionId}
                        onChange={(e) => { setLockerInstitutionId(e.target.value); update("dropoff_locker_id", ""); }}
                      >
                        <option value="">Select an institution…</option>
                        {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </Field>
                  ) : (
                    <Field label="City">
                      <select
                        className={inputClass}
                        value={lockerCity}
                        onChange={(e) => { setLockerCity(e.target.value); update("dropoff_locker_id", ""); }}
                      >
                        {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  )}

                  <Field label="Locker">
                    <select
                      required={lockerMode}
                      disabled={lockerLocationType === "campus" && !lockerInstitutionId}
                      className={inputClass}
                      value={form.dropoff_locker_id}
                      onChange={(e) => update("dropoff_locker_id", e.target.value)}
                    >
                      <option value="">{lockers.length === 0 ? "No lockers here yet" : "Select a locker…"}</option>
                      {lockers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </Field>
                  {selectedLocker?.address && (
                    <p className="text-xs text-slate dark:text-slate-light mt-1.5">{selectedLocker.address}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-3">
                    <Field label="Drop-off address">
                      <input required className={inputClass} value={form.dropoff_address} onChange={(e) => update("dropoff_address", e.target.value)} placeholder="5 Admiralty Way" />
                    </Field>
                    <Field label="Drop-off city">
                      <select className={inputClass} value={form.dropoff_city} onChange={(e) => update("dropoff_city", e.target.value)}>
                        {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Drop-off landmark (optional)">
                    <input className={inputClass} value={form.dropoff_landmark} onChange={(e) => update("dropoff_landmark", e.target.value)} placeholder="Near Shoprite entrance" />
                  </Field>
                  <Suspense fallback={null}>
                    <PinMap
                      token={token}
                      address={form.dropoff_address}
                      city={form.dropoff_city}
                      coords={form.dropoff_coords}
                      onCoordsChange={(c) => update("dropoff_coords", c)}
                      suggestOpen={addressLookupFailed}
                    />
                  </Suspense>
                </>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Recipient name">
              <input required className={inputClass} value={form.recipient_name} onChange={(e) => update("recipient_name", e.target.value)} placeholder="John Doe" />
            </Field>
            <Field label="Recipient phone">
              <input required className={inputClass} value={form.recipient_phone} onChange={(e) => update("recipient_phone", e.target.value)} placeholder="0809 999 8888" />
            </Field>
          </div>

          <span className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Preferred vehicle</span>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {VEHICLES.map((v) => (
              <button type="button" key={v.value} onClick={() => update("preferred_vehicle", v.value)}
                className={`text-xs font-medium rounded-lg px-2 py-2 border transition-colors ${
                  form.preferred_vehicle === v.value ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 hover:border-slate-400"
                }`}>
                {v.label}
              </button>
            ))}
          </div>

          <label className={`flex items-start gap-2.5 border rounded-lg p-3.5 mb-4 ${form.pool_delivery ? "border-slate-200 dark:border-line bg-slate-50 dark:bg-white/5 opacity-60" : "border-slate-200 dark:border-line bg-paper cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={form.guaranteed}
              disabled={form.pool_delivery}
              onChange={(e) => update("guaranteed", e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink dark:text-paper">
              Guarantee this delivery — +₦300
              <span className="block text-xs text-slate dark:text-slate-light mt-0.5">
                {form.pool_delivery
                  ? "Not available when pooling — pick one or the other."
                  : "If it's not handed off within the estimated window, you get ₦500 credited to your wallet automatically. No need to ask."}
              </span>
            </span>
          </label>

          <label className={`flex items-start gap-2.5 border rounded-lg p-3.5 mb-4 ${form.pool_delivery ? "border-slate-200 dark:border-line bg-slate-50 dark:bg-white/5 opacity-60" : "border-slate-200 dark:border-line bg-paper cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={form.elite_requested}
              disabled={form.pool_delivery}
              onChange={(e) => update("elite_requested", e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink dark:text-paper">
              Elite agent only — +₦400
              <span className="block text-xs text-slate dark:text-slate-light mt-0.5">
                {form.pool_delivery
                  ? "Not available when pooling — pick one or the other."
                  : "Only our highest-rated, most reliable agents — 4.8★+ and 95%+ on-time — can accept this job."}
              </span>
            </span>
          </label>

          <div className={`border rounded-lg p-3.5 mb-4 ${form.pool_delivery ? "border-slate-200 dark:border-line bg-slate-50 dark:bg-white/5 opacity-60" : "border-slate-200 dark:border-line bg-paper"}`}>
            <label className="block text-sm text-ink dark:text-paper mb-1">
              Insure this package (optional)
            </label>
            <input
              type="number"
              min="0"
              disabled={form.pool_delivery}
              className={inputClass}
              placeholder="Item value in ₦ (e.g. 15000)"
              value={form.declared_value}
              onChange={(e) => update("declared_value", e.target.value)}
            />
            <p className="text-xs text-slate dark:text-slate-light mt-1.5">
              {form.pool_delivery
                ? "Not available when pooling — pick one or the other."
                : form.declared_value && Number(form.declared_value) > 0
                  ? (() => {
                      const covered = Math.min(Number(form.declared_value), 50000);
                      const premium = Math.max(Math.round(covered * 0.02), 100);
                      return `Covers up to \u20a6${covered.toLocaleString()} \u00b7 premium: +\u20a6${premium.toLocaleString()}${Number(form.declared_value) > 50000 ? " (coverage capped at \u20a650,000)" : ""}`;
                    })()
                  : "Declare the item's value to add insurance coverage — 2% premium, capped at ₦50,000 coverage."}
            </p>
          </div>


          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => update("payment_method", "paystack")}
              className={`text-xs font-medium rounded-lg px-2 py-2.5 border transition-colors ${
                form.payment_method === "paystack" ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 hover:border-slate-400"
              }`}
            >
              Card / bank (Paystack)
            </button>
            <button
              type="button"
              disabled={estimate !== null && walletBalance < estimate}
              onClick={() => update("payment_method", "wallet")}
              className={`text-xs font-medium rounded-lg px-2 py-2.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                form.payment_method === "wallet" ? "border-ink bg-ink text-paper dark:bg-route dark:text-ink" : "border-slate-300 hover:border-slate-400"
              }`}
            >
              Wallet (₦{walletBalance.toLocaleString()})
            </button>
          </div>
          {form.payment_method === "wallet" && estimate !== null && walletBalance < estimate && (
            <p className="text-xs text-signal mb-4">Not enough wallet balance for this delivery — top up above, or pay by card.</p>
          )}

          {estimate !== null && (
            <div className="flex items-center justify-between bg-paper border border-slate-200 dark:border-line rounded-lg px-4 py-3 mb-4">
              <div>
                <span className="text-sm text-slate dark:text-slate-light">Estimated price</span>
                {estimateDistance !== null && (
                  <div className="text-xs text-slate dark:text-slate-light">≈ {estimateDistance} km driving distance</div>
                )}
              </div>
              <span className="font-mono font-semibold text-lg">₦{estimate.toLocaleString()}</span>
            </div>
          )}

          {error && <p className="text-sm text-signal mb-4">{error}</p>}

          <button
            disabled={submitting || (campusMode && (!form.institution_id || !form.pickup_landmark_id || !form.dropoff_landmark_id || form.pickup_landmark_id === form.dropoff_landmark_id)) || (lockerMode && !form.dropoff_locker_id)}
            className="w-full bg-route hover:bg-route-dark text-ink dark:text-paper font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60"
          >
            {submitting ? "Redirecting to payment…" : form.payment_method === "wallet" ? "Pay from wallet" : "Continue to payment"}
          </button>
        </form>
      </div>

      <div className="lg:col-span-3">
        <h2 className="font-display text-lg font-semibold mb-4">Your deliveries</h2>
        {loadingList ? (
          <SkeletonCardList count={3} />
        ) : deliveries.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No deliveries yet."
            description="Post your first delivery on the left to get started."
            className="border border-dashed border-slate-300 dark:border-line rounded-2xl"
          />
        ) : (
          <div className="space-y-3">
            {deliveries.map((d) => (
              <div key={d.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-mono text-xs text-slate dark:text-slate-light mb-1 flex items-center gap-2">
                      {d.tracking_code}
                      {d.is_return && (
                        <span className="text-[10px] font-semibold bg-route/10 text-route-dark rounded-full px-2 py-0.5">
                          ↩ Return
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm">
                      {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                      {d.distance_km && <span className="text-slate dark:text-slate-light font-normal"> · {d.distance_km} km</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={d.status} />
                    {d.payment_status !== "paid" && <StatusBadge status={d.payment_status} />}
                  </div>
                </div>
                <div className="text-xs text-slate dark:text-slate-light space-y-0.5 mb-2">
                  <div>Pickup: {d.pickup_address}{d.pickup_landmark && ` (${d.pickup_landmark})`}</div>
                  <div>Drop-off: {d.dropoff_address}{d.dropoff_landmark && ` (${d.dropoff_landmark})`} · to {d.recipient_name}</div>
                  {d.agent_name && (
                    <div className="flex items-center gap-2">
                      {d.agent_photo && (
                        <img src={d.agent_photo} alt={d.agent_name} className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-line" />
                      )}
                      <span>Agent: {d.agent_name} · {d.agent_phone}</span>
                    </div>
                  )}
                </div>

                {["accepted", "picked_up", "in_transit"].includes(d.status) && (
                  <div className="mb-3">
                    <Suspense fallback={<div style={{ height: 220 }} className="rounded-xl bg-paper border border-slate-200 dark:border-line animate-pulse" />}>
                      <DeliveryMap
                        height={220}
                        pickup={d.pickup_lat != null ? { lat: d.pickup_lat, lng: d.pickup_lng } : null}
                        dropoff={d.dropoff_lat != null ? { lat: d.dropoff_lat, lng: d.dropoff_lng } : null}
                        current={d.current_lat != null ? { lat: d.current_lat, lng: d.current_lng } : null}
                      />
                    </Suspense>
                    {d.current_lat != null && (
                      <p className="text-xs text-slate dark:text-slate-light mt-1.5">
                        Agent location last updated {new Date(d.location_updated_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}
                {d.declared_value && ["delivered", "cancelled"].includes(d.status) && (
                  <div className="border border-slate-200 dark:border-line rounded-lg p-3 mb-3 bg-paper">
                    {claimStatus[d.id] ? (
                      <p className="text-xs text-slate dark:text-slate-light">{claimStatus[d.id]}</p>
                    ) : claimFormOpenId === d.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={claimReason}
                          onChange={(e) => setClaimReason(e.target.value)}
                          placeholder="What happened? (e.g. item arrived damaged)"
                          rows={2}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        />
                        <input
                          type="number"
                          min="0"
                          max={Math.min(d.declared_value, 50000)}
                          value={claimAmount}
                          onChange={(e) => setClaimAmount(e.target.value)}
                          placeholder={`Amount to claim (up to \u20a6${Math.min(d.declared_value, 50000).toLocaleString()})`}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={claimSubmitting}
                            onClick={() => handleFileClaim(d.id)}
                            className="text-xs font-semibold bg-ink text-paper dark:bg-route dark:text-ink rounded-lg px-3 py-1.5 disabled:opacity-60"
                          >
                            {claimSubmitting ? "Submitting…" : "Submit claim"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setClaimFormOpenId(null); setClaimReason(""); setClaimAmount(""); }}
                            className="text-xs font-medium text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper dark:text-paper"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setClaimFormOpenId(d.id)}
                        className="text-xs font-semibold text-ink dark:text-paper underline"
                      >
                        File an insurance claim
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">₦{d.price.toLocaleString()}</span>
                  <div className="flex items-center gap-3">
                    {["unpaid", "failed"].includes(d.payment_status) && d.status !== "cancelled" && (
                      <button onClick={() => handleRetryPayment(d.id)} className="text-xs bg-route hover:bg-route-dark text-ink dark:text-paper font-semibold rounded-lg px-3 py-1.5 transition-colors">
                        Complete payment
                      </button>
                    )}
                    {["pending", "accepted"].includes(d.status) && (
                      <button onClick={() => handleCancel(d.id)} className="text-xs text-signal hover:text-brand-dark font-medium hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {d.status === "delivered" && (
                  d.review_rating ? (
                    <div className="border-t border-slate-100 mt-3 pt-3 flex items-center gap-2">
                      <StarRating value={d.review_rating} readOnly size={16} />
                      {d.review_comment && <span className="text-xs text-slate dark:text-slate-light">"{d.review_comment}"</span>}
                    </div>
                  ) : (
                    <ReviewForm deliveryId={d.id} token={token} onSubmitted={loadDeliveries} />
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Computed right before render from data already loaded — matches the
  // definition of "on the way" used in the delivery status stepper
  // (picked_up / in_transit), not just "not yet delivered", so a pending-
  // but-not-yet-picked-up order doesn't inflate the count.
  const activeDeliveryCount = deliveries.filter((d) => ["picked_up", "in_transit"].includes(d.status)).length;

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <TripCompleteCelebration trip={celebrating} onClose={dismissCelebration} />
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
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">
        {isBusiness ? `BUSINESS DASHBOARD · ${user.company_name}` : "CUSTOMER DASHBOARD"}
      </div>
      <DashboardGreeting
        name={user?.full_name}
        subtitle={
          activeDeliveryCount > 0
            ? `${activeDeliveryCount} ${activeDeliveryCount === 1 ? "delivery" : "deliveries"} on the way`
            : "No deliveries in progress right now"
        }
        className="mb-5"
      />
      {streak && streakDays && (
        <StreakCalendar
          days={streakDays}
          currentStreak={streak.current_streak}
          longestStreak={streak.longest_streak}
          nextMilestoneInfo={streakNextMilestone}
          className="mb-8"
        />
      )}
      <h1 className="font-display text-3xl font-semibold mb-8">
        {tab === "send" ? "Send a new delivery" : tab === "bulk" ? "Bulk upload" : tab === "invoices" ? "Invoices" : tab === "reports" ? "Reports" : "API access"}
      </h1>

      {isBusiness && (
        <div className="flex gap-2 mb-8 border-b border-slate-200 dark:border-line">
          {[
            { id: "send", label: "Send a delivery" },
            { id: "bulk", label: "Bulk upload" },
            { id: "invoices", label: "Invoices" },
            { id: "reports", label: "Reports" },
            { id: "api", label: "API" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-ink text-ink dark:text-paper" : "border-transparent text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper dark:text-paper"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "send" && sendDeliveryView}
      {tab === "bulk" && isBusiness && (
        <BulkUpload
          token={token}
          walletBalance={walletBalance}
          onComplete={() => { loadDeliveries(); refreshWallet(); }}
        />
      )}
      {tab === "invoices" && isBusiness && <Invoices deliveries={deliveries} />}
      {tab === "reports" && isBusiness && <Reports deliveries={deliveries} />}
      {tab === "api" && isBusiness && <ApiSettings token={token} />}
    </div>
  );
}
