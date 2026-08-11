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
  pickup_address: "", pickup_city: "Lagos", pickup_landmark: "", pickup_coords: null,
  dropoff_address: "", dropoff_city: "Lagos", dropoff_landmark: "", dropoff_coords: null,
  recipient_name: "", recipient_phone: "",
  preferred_vehicle: "any", payment_method: "paystack",
  institution_id: "", pickup_landmark_id: "", dropoff_landmark_id: "",
  dropoff_locker_id: "",
  pool_delivery: false,
  guaranteed: false,
  elite_requested: false,
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
        <form onSubmit={handleSubmit} className="border border-slate-200 rounded-2xl p-6 bg-white h-fit">
          <Field label="What are you sending?">
            <select className={inputClass} value={form.package_type} onChange={(e) => update("package_type", e.target.value)}>
              {PACKAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Note for the agent (optional)">
            <input className={inputClass} value={form.package_note} onChange={(e) => update("package_note", e.target.value)} placeholder="Fragile — handle with care" />
          </Field>

          {institutions.length > 0 && (
            <button
              type="button"
              onClick={toggleCampusMode}
              className={`w-full text-left text-sm font-medium rounded-lg px-3.5 py-2.5 border mb-2 transition-colors ${
                campusMode ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400 text-ink"
              }`}
            >
              {campusMode ? "✓ Delivering within a campus" : "Delivering within a campus?"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleLockerMode}
            className={`w-full text-left text-sm font-medium rounded-lg px-3.5 py-2.5 border mb-4 transition-colors ${
              lockerMode ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400 text-ink"
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
                <label className="flex items-start gap-2.5 border border-slate-200 rounded-lg p-3.5 mb-4 bg-paper cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pool_delivery}
                    onChange={(e) => setForm((f) => ({
                      ...f, pool_delivery: e.target.checked,
                      guaranteed: e.target.checked ? false : f.guaranteed,
                      elite_requested: e.target.checked ? false : f.elite_requested,
                    }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-ink">
                    Pool this delivery to save
                    <span className="block text-xs text-slate mt-0.5">
                      Share your trip with others delivering to this campus around the same time — up to 20% off.
                      If more people join after you order, you'll be refunded the difference straight to your
                      wallet automatically. The price shown below doesn't include this discount yet, since it
                      depends on who else joins.
                    </span>
                  </span>
                </label>
              )}

              {form.institution_id && (
                <div className="border border-slate-200 rounded-lg p-3.5 mb-4 bg-paper">
                  <button
                    type="button"
                    onClick={() => setShowSuggestForm((v) => !v)}
                    className="text-xs font-semibold text-ink underline"
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
                        className="text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-1.5 disabled:opacity-60"
                      >
                        {suggestSubmitting ? "Submitting…" : "Submit landmark"}
                      </button>
                      {suggestStatus && <p className="text-xs text-slate mt-1.5">{suggestStatus}</p>}
                    </div>
                  )}

                  {pendingLandmarks.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <div className="text-xs font-semibold text-ink mb-2">Help verify landmarks near you</div>
                      <div className="space-y-2">
                        {pendingLandmarks.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <div>
                              <div className="font-medium text-ink">{p.name}</div>
                              {p.note && <div className="text-slate">{p.note}</div>}
                              <div className="text-slate-light mt-0.5">{p.confirmation_count} of 3 confirmations</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleConfirmLandmark(p.id)}
                              disabled={confirmingId === p.id}
                              className="shrink-0 text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-2.5 py-1.5 disabled:opacity-60"
                            >
                              {confirmingId === p.id ? "…" : "Confirm"}
                            </button>
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
                <div className="border border-slate-200 rounded-lg p-3.5 mb-4 bg-paper">
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => { setLockerLocationType("campus"); update("dropoff_locker_id", ""); }}
                      className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${
                        lockerLocationType === "campus" ? "border-ink bg-ink text-paper" : "border-slate-300 text-ink"
                      }`}
                    >
                      On a campus
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLockerLocationType("city"); update("dropoff_locker_id", ""); }}
                      className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${
                        lockerLocationType === "city" ? "border-ink bg-ink text-paper" : "border-slate-300 text-ink"
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
                    <p className="text-xs text-slate mt-1.5">{selectedLocker.address}</p>
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

          <span className="block text-sm font-medium text-ink mb-1.5">Preferred vehicle</span>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {VEHICLES.map((v) => (
              <button type="button" key={v.value} onClick={() => update("preferred_vehicle", v.value)}
                className={`text-xs font-medium rounded-lg px-2 py-2 border transition-colors ${
                  form.preferred_vehicle === v.value ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400"
                }`}>
                {v.label}
              </button>
            ))}
          </div>

          <label className={`flex items-start gap-2.5 border rounded-lg p-3.5 mb-4 ${form.pool_delivery ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-paper cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={form.guaranteed}
              disabled={form.pool_delivery}
              onChange={(e) => update("guaranteed", e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink">
              Guarantee this delivery — +₦300
              <span className="block text-xs text-slate mt-0.5">
                {form.pool_delivery
                  ? "Not available when pooling — pick one or the other."
                  : "If it's not handed off within the estimated window, you get ₦500 credited to your wallet automatically. No need to ask."}
              </span>
            </span>
          </label>

          <label className={`flex items-start gap-2.5 border rounded-lg p-3.5 mb-4 ${form.pool_delivery ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-paper cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={form.elite_requested}
              disabled={form.pool_delivery}
              onChange={(e) => update("elite_requested", e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink">
              Elite agent only — +₦400
              <span className="block text-xs text-slate mt-0.5">
                {form.pool_delivery
                  ? "Not available when pooling — pick one or the other."
                  : "Only our highest-rated, most reliable agents — 4.8★+ and 95%+ on-time — can accept this job."}
              </span>
            </span>
          </label>

          <span className="block text-sm font-medium text-ink mb-1.5">Pay with</span>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => update("payment_method", "paystack")}
              className={`text-xs font-medium rounded-lg px-2 py-2.5 border transition-colors ${
                form.payment_method === "paystack" ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400"
              }`}
            >
              Card / bank (Paystack)
            </button>
            <button
              type="button"
              disabled={estimate !== null && walletBalance < estimate}
              onClick={() => update("payment_method", "wallet")}
              className={`text-xs font-medium rounded-lg px-2 py-2.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                form.payment_method === "wallet" ? "border-ink bg-ink text-paper" : "border-slate-300 hover:border-slate-400"
              }`}
            >
              Wallet (₦{walletBalance.toLocaleString()})
            </button>
          </div>
          {form.payment_method === "wallet" && estimate !== null && walletBalance < estimate && (
            <p className="text-xs text-signal mb-4">Not enough wallet balance for this delivery — top up above, or pay by card.</p>
          )}

          {estimate !== null && (
            <div className="flex items-center justify-between bg-paper border border-slate-200 rounded-lg px-4 py-3 mb-4">
              <div>
                <span className="text-sm text-slate">Estimated price</span>
                {estimateDistance !== null && (
                  <div className="text-xs text-slate">≈ {estimateDistance} km driving distance</div>
                )}
              </div>
              <span className="font-mono font-semibold text-lg">₦{estimate.toLocaleString()}</span>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <button
            disabled={submitting || (campusMode && (!form.institution_id || !form.pickup_landmark_id || !form.dropoff_landmark_id || form.pickup_landmark_id === form.dropoff_landmark_id)) || (lockerMode && !form.dropoff_locker_id)}
            className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60"
          >
            {submitting ? "Redirecting to payment…" : form.payment_method === "wallet" ? "Pay from wallet" : "Continue to payment"}
          </button>
        </form>
      </div>

      <div className="lg:col-span-3">
        <h2 className="font-display text-lg font-semibold mb-4">Your deliveries</h2>
        {loadingList ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : deliveries.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate text-sm">
            No deliveries yet. Post your first one on the left.
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries.map((d) => (
              <div key={d.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-mono text-xs text-slate mb-1">{d.tracking_code}</div>
                    <div className="font-semibold text-sm">
                      {d.package_type} · {d.pickup_city} → {d.dropoff_city}
                      {d.distance_km && <span className="text-slate font-normal"> · {d.distance_km} km</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={d.status} />
                    {d.payment_status !== "paid" && <StatusBadge status={d.payment_status} />}
                  </div>
                </div>
                <div className="text-xs text-slate space-y-0.5 mb-2">
                  <div>Pickup: {d.pickup_address}{d.pickup_landmark && ` (${d.pickup_landmark})`}</div>
                  <div>Drop-off: {d.dropoff_address}{d.dropoff_landmark && ` (${d.dropoff_landmark})`} · to {d.recipient_name}</div>
                  {d.agent_name && (
                    <div className="flex items-center gap-2">
                      {d.agent_photo && (
                        <img src={d.agent_photo} alt={d.agent_name} className="w-6 h-6 rounded-full object-cover border border-slate-200" />
                      )}
                      <span>Agent: {d.agent_name} · {d.agent_phone}</span>
                    </div>
                  )}
                </div>

                {["accepted", "picked_up", "in_transit"].includes(d.status) && (
                  <div className="mb-3">
                    <Suspense fallback={<div style={{ height: 220 }} className="rounded-xl bg-paper border border-slate-200 animate-pulse" />}>
                      <DeliveryMap
                        height={220}
                        pickup={d.pickup_lat != null ? { lat: d.pickup_lat, lng: d.pickup_lng } : null}
                        dropoff={d.dropoff_lat != null ? { lat: d.dropoff_lat, lng: d.dropoff_lng } : null}
                        current={d.current_lat != null ? { lat: d.current_lat, lng: d.current_lng } : null}
                      />
                    </Suspense>
                    {d.current_lat != null && (
                      <p className="text-xs text-slate mt-1.5">
                        Agent location last updated {new Date(d.location_updated_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">₦{d.price.toLocaleString()}</span>
                  <div className="flex items-center gap-3">
                    {["unpaid", "failed"].includes(d.payment_status) && d.status !== "cancelled" && (
                      <button onClick={() => handleRetryPayment(d.id)} className="text-xs bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-3 py-1.5 transition-colors">
                        Complete payment
                      </button>
                    )}
                    {["pending", "accepted"].includes(d.status) && (
                      <button onClick={() => handleCancel(d.id)} className="text-xs text-red-600 font-medium hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {d.status === "delivered" && (
                  d.review_rating ? (
                    <div className="border-t border-slate-100 mt-3 pt-3 flex items-center gap-2">
                      <StarRating value={d.review_rating} readOnly size={16} />
                      {d.review_comment && <span className="text-xs text-slate">"{d.review_comment}"</span>}
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

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">
        {isBusiness ? `BUSINESS DASHBOARD · ${user.company_name}` : "CUSTOMER DASHBOARD"}
      </div>
      <h1 className="font-display text-3xl font-semibold mb-8">
        {tab === "send" ? "Send a new delivery" : tab === "bulk" ? "Bulk upload" : tab === "invoices" ? "Invoices" : tab === "reports" ? "Reports" : "API access"}
      </h1>

      {isBusiness && (
        <div className="flex gap-2 mb-8 border-b border-slate-200">
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
                tab === t.id ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
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
