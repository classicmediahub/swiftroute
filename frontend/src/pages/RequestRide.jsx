import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import PinMap from "../components/PinMap";
import DeliveryMap from "../components/DeliveryMap";
import StarRating from "../components/StarRating";

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

const ACTIVE_STATUSES = ["accepted", "in_progress"];
const MAP_POLL_INTERVAL_MS = 8000; // matches useRideLocation's ping interval on the agent side

// Small local status badge, not the shared StatusBadge component — ride
// statuses (in_progress/completed) are a different set of strings than
// delivery statuses (in_transit/delivered), and StatusBadge's internals
// weren't available to confirm it handles arbitrary values gracefully.
const STATUS_LABEL = {
  pending: "Finding a driver",
  accepted: "Driver on the way",
  in_progress: "Trip in progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const STATUS_COLOR = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
};
function RideStatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function RequestRide() {
  const { token } = useAuth();
  const [tab, setTab] = useState("request");

  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCity, setPickupCity] = useState("Lagos");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCity, setDropoffCity] = useState("Lagos");
  const [dropoffCoords, setDropoffCoords] = useState(null);

  const [quote, setQuote] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  const [rides, setRides] = useState([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const pollRef = useRef(null);

  const loadRides = useCallback(async () => {
    try {
      setRides(await api.myRides(token));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRides(false);
    }
  }, [token]);

  useEffect(() => { loadRides(); }, [loadRides]);

  // While on "My rides" and at least one ride is actively underway, poll
  // for updates so the live map below actually shows the driver moving —
  // otherwise this would just be a single static snapshot from page load.
  const hasActiveRide = rides.some((r) => ACTIVE_STATUSES.includes(r.status));
  useEffect(() => {
    if (tab !== "mine" || !hasActiveRide) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(loadRides, MAP_POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [tab, hasActiveRide, loadRides]);

  const canEstimate = pickupCoords && dropoffCoords && pickupAddress && dropoffAddress;

  async function handleEstimate() {
    setError("");
    setQuote(null);
    setEstimating(true);
    try {
      const result = await api.rideEstimate(token, {
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        pickup_coords: pickupCoords,
        dropoff_coords: dropoffCoords,
      });
      setQuote(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setEstimating(false);
    }
  }

  async function handleRequestRide() {
    setError("");
    setRequesting(true);
    try {
      const data = await api.requestRide(token, {
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        pickup_coords: pickupCoords,
        dropoff_coords: dropoffCoords,
      });
      if (data.authorization_url) {
        window.location.href = data.authorization_url; // off to Paystack checkout
      } else {
        setTab("mine");
        loadRides();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  }

  async function handleRetryPayment(id) {
    try {
      const data = await api.retryRidePayment(token, id);
      window.location.href = data.authorization_url;
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCancel(id) {
    if (!confirm("Cancel this ride request?")) return;
    try {
      await api.cancelRide(token, id);
      loadRides();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-10">
      <div className="font-mono text-xs text-slate mb-2">RIDES</div>
      <h1 className="font-display text-3xl font-semibold mb-6">Get a ride</h1>

      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>Request a ride</TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>My rides ({rides.length})</TabButton>
      </div>

      {tab === "request" ? (
        <div className="space-y-5">
          <div className="border border-slate-200 rounded-2xl p-5 bg-white">
            <div className="text-sm font-medium text-ink mb-3">Pickup</div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 mb-2">
              <input
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Street / landmark"
                value={pickupAddress}
                onChange={(e) => { setPickupAddress(e.target.value); setPickupCoords(null); setQuote(null); }}
              />
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={pickupCity}
                onChange={(e) => setPickupCity(e.target.value)}
              >
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <PinMap
              token={token}
              address={pickupAddress}
              city={pickupCity}
              coords={pickupCoords}
              onCoordsChange={(c) => { setPickupCoords(c); setQuote(null); }}
            />
          </div>

          <div className="border border-slate-200 rounded-2xl p-5 bg-white">
            <div className="text-sm font-medium text-ink mb-3">Drop-off</div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 mb-2">
              <input
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Street / landmark"
                value={dropoffAddress}
                onChange={(e) => { setDropoffAddress(e.target.value); setDropoffCoords(null); setQuote(null); }}
              />
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={dropoffCity}
                onChange={(e) => setDropoffCity(e.target.value)}
              >
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <PinMap
              token={token}
              address={dropoffAddress}
              city={dropoffCity}
              coords={dropoffCoords}
              onCoordsChange={(c) => { setDropoffCoords(c); setQuote(null); }}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!quote ? (
            <button
              disabled={!canEstimate || estimating}
              onClick={handleEstimate}
              className="w-full bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50"
            >
              {estimating ? "Calculating fare…" : "Get fare estimate"}
            </button>
          ) : (
            <div className="border border-slate-200 rounded-2xl p-5 bg-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-slate mb-0.5">Estimated fare</div>
                  <div className="font-mono text-2xl font-semibold">₦{quote.price.toLocaleString()}</div>
                  <div className="text-xs text-slate mt-0.5">{quote.distanceKm} km · cab</div>
                </div>
                <button onClick={() => setQuote(null)} className="text-xs font-semibold text-ink underline">
                  Recalculate
                </button>
              </div>
              <button
                disabled={requesting}
                onClick={handleRequestRide}
                className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-60"
              >
                {requesting ? "Starting checkout…" : `Request ride & pay ₦${quote.price.toLocaleString()}`}
              </button>
            </div>
          )}
        </div>
      ) : loadingRides ? (
        <p className="text-sm text-slate">Loading…</p>
      ) : rides.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate text-sm">
          No rides yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rides.map((r) => {
            const isActive = ACTIVE_STATUSES.includes(r.status);
            return (
              <div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-sm">
                    <div className="font-semibold mb-0.5">{r.pickup_address} → {r.dropoff_address}</div>
                    <div className="text-xs text-slate">{r.distance_km ? `${r.distance_km} km · ` : ""}₦{r.price.toLocaleString()}</div>
                  </div>
                  <RideStatusBadge status={r.status} />
                </div>
                {r.agent_name && (
                  <div className="text-xs text-slate mb-2">Driver: {r.agent_name} · {r.agent_phone}</div>
                )}

                {isActive && (
                  <div className="my-3">
                    <DeliveryMap
                      pickup={{ lat: r.pickup_lat, lng: r.pickup_lng }}
                      dropoff={{ lat: r.dropoff_lat, lng: r.dropoff_lng }}
                      current={r.current_lat != null && r.current_lng != null ? { lat: r.current_lat, lng: r.current_lng } : null}
                      height={240}
                    />
                  </div>
                )}

                {r.status === "completed" && (
                  <RideReview ride={r} token={token} onSubmitted={loadRides} />
                )}

                <div className="flex items-center gap-3">
                  {r.payment_status !== "paid" && r.status !== "cancelled" && (
                    <button onClick={() => handleRetryPayment(r.id)} className="text-xs font-semibold text-ink underline">
                      Complete payment
                    </button>
                  )}
                  {["pending", "accepted"].includes(r.status) && (
                    <button onClick={() => handleCancel(r.id)} className="text-xs font-semibold text-red-600 underline">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RideReview({ ride, token, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Already reviewed — /rides/mine joins ride_reviews, so review_rating is
  // present directly on the ride object once one exists. Read-only display,
  // no need to hit the API again.
  if (ride.review_rating != null) {
    return (
      <div className="border-t border-slate-100 mt-3 pt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-slate">Your rating:</span>
          <StarRating value={ride.review_rating} readOnly size={14} />
        </div>
        {ride.review_comment && <p className="text-xs text-slate italic">"{ride.review_comment}"</p>}
      </div>
    );
  }

  async function handleSubmit() {
    if (!rating) return;
    setError("");
    setSubmitting(true);
    try {
      await api.submitRideReview(token, ride.id, { rating, comment });
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-slate-100 mt-3 pt-3">
      <div className="text-xs font-medium text-ink mb-2">Rate this trip</div>
      <StarRating value={rating} onChange={setRating} size={20} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 1000))}
        placeholder="Optional comment"
        rows={2}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-2"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <button
        disabled={!rating || submitting}
        onClick={handleSubmit}
        className="mt-2 text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-2 hover:bg-ink-soft transition-colors disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
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
