import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import PinMap from "../components/PinMap";
import DeliveryMap from "../components/DeliveryMap";
import StarRating from "../components/StarRating";
import RideMeter from "../components/RideMeter";
import TripStatusStepper, { RIDE_STEPS } from "../components/TripStatusStepper";
import TripCompleteCelebration from "../components/TripCompleteCelebration";
import { useCelebrateOnComplete } from "../hooks/useCelebrateOnComplete";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import { Car } from "lucide-react";

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

const ACTIVE_STATUSES = ["accepted", "in_progress"];
const MAP_POLL_INTERVAL_MS = 8000; // matches useRideLocation's ping interval on the agent side

// RideStatusBadge is gone — replaced by the shared TripStatusStepper,
// which shows the same information (where this ride is in its lifecycle)
// as a horizontal progress stepper instead of a flat colored badge.

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
  const [walletBalance, setWalletBalance] = useState(0);

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

  useEffect(() => {
    loadRides();
    api.getWallet(token).then((w) => setWalletBalance(w.wallet_balance)).catch(() => {});
  }, [loadRides, token]);

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

  // Fires the confetti overlay exactly once, the first time a ride is
  // observed as 'completed' — not on every subsequent poll of the same
  // already-completed ride. See useCelebrateOnComplete.js for why that
  // distinction needs its own hook rather than a plain useEffect.
  const { celebrating, dismiss: dismissCelebration } = useCelebrateOnComplete(rides, {
    getId: (r) => r.id,
    getStatus: (r) => r.status,
    completedStatuses: ["completed"],
    toCelebration: (r) => ({
      id: r.id,
      badge: "Trip complete",
      title: "You've arrived!",
      subtitle: `${r.pickup_address} → ${r.dropoff_address}`,
      stats: [
        { label: "Distance", value: r.distance_km ? `${r.distance_km} km` : "—" },
        {
          label: "Duration",
          value:
            r.started_at && r.completed_at
              ? `${Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 60000)} min`
              : "—",
        },
      ],
      price: r.price,
      priceLabel: "Trip total",
      closeLabel: "Nice ride!",
    }),
  });

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
      await api.requestRide(token, {
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        pickup_coords: pickupCoords,
        dropoff_coords: dropoffCoords,
      });
      // No payment here anymore — you pay after the trip, once the meter
      // shows the real total. See handleChargeRide below.
      setTab("mine");
      loadRides();
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  }

  const [payingId, setPayingId] = useState(null);
  async function handleChargeRide(id, method) {
    setPayingId(id);
    try {
      const data = await api.chargeRide(token, id, method);
      if (data.authorization_url) {
        window.location.href = data.authorization_url; // off to Paystack checkout
      } else {
        loadRides(); // wallet paid instantly — just refresh to show "Paid"
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setPayingId(null);
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
      <TripCompleteCelebration trip={celebrating} onClose={dismissCelebration} />
      <div className="font-mono text-xs text-slate dark:text-slate-light mb-2">RIDES</div>
      <h1 className="font-display text-3xl font-semibold mb-6">Get a ride</h1>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-line">
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>Request a ride</TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>My rides ({rides.length})</TabButton>
      </div>

      {tab === "request" ? (
        <div className="space-y-5">
          <div className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
            <div className="text-sm font-medium text-ink dark:text-paper mb-3">Pickup</div>
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

          <div className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
            <div className="text-sm font-medium text-ink dark:text-paper mb-3">Drop-off</div>
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

          {error && <p className="text-sm text-signal">{error}</p>}

          {!quote ? (
            <button
              disabled={!canEstimate || estimating}
              onClick={handleEstimate}
              className="w-full bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50"
            >
              {estimating ? "Calculating fare…" : "Get fare estimate"}
            </button>
          ) : (
            <div className="border border-slate-200 dark:border-line rounded-2xl p-5 bg-white dark:bg-ink-soft">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-slate dark:text-slate-light mb-0.5">Estimated fare</div>
                  <div className="font-mono text-2xl font-semibold">₦{quote.price.toLocaleString()}</div>
                  <div className="text-xs text-slate dark:text-slate-light mt-0.5">{quote.distanceKm} km · cab</div>
                </div>
                <button onClick={() => setQuote(null)} className="text-xs font-semibold text-ink dark:text-paper underline">
                  Recalculate
                </button>
              </div>

              <p className="text-xs text-slate dark:text-slate-light mb-4">
                This is just a ballpark. Once your driver starts the trip, the meter runs on real
                distance and time — you'll see the exact total live, and only pay once the trip ends.
              </p>

              <Button loading={requesting} loadingText="Requesting…" onClick={handleRequestRide} fullWidth size="lg">
                Request ride
              </Button>
            </div>
          )}
        </div>
      ) : loadingRides ? (
        <SkeletonCardList count={2} />
      ) : rides.length === 0 ? (
        <EmptyState
          icon={Car}
          title="No rides yet."
          description="Once you request a ride, it'll show up here."
          className="border border-dashed border-slate-300 dark:border-line rounded-2xl"
        />
      ) : (
        <div className="space-y-3">
          {rides.map((r) => {
            const isActive = ACTIVE_STATUSES.includes(r.status);
            return (
              <div key={r.id} className="border border-slate-200 dark:border-line rounded-xl p-4 bg-white dark:bg-ink-soft">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-sm">
                    <div className="font-semibold mb-0.5">{r.pickup_address} → {r.dropoff_address}</div>
                    <div className="text-xs text-slate dark:text-slate-light">{r.distance_km ? `${r.distance_km} km · ` : ""}₦{r.price.toLocaleString()}</div>
                  </div>
                </div>
                <TripStatusStepper steps={RIDE_STEPS} currentKey={r.status} className="mb-3" />
                {r.agent_name && (
                  <div className="text-xs text-slate dark:text-slate-light mb-2">Driver: {r.agent_name} · {r.agent_phone}</div>
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

                {(r.status === "in_progress" || r.status === "completed") && (
                  <div className="my-3">
                    <RideMeter token={token} rideId={r.id} status={r.status} />
                  </div>
                )}

                {r.status === "completed" && r.payment_status !== "paid" && (
                  <RidePayment ride={r} walletBalance={walletBalance} paying={payingId === r.id} onPay={(method) => handleChargeRide(r.id, method)} />
                )}

                {r.status === "completed" && (
                  <RideReview ride={r} token={token} onSubmitted={loadRides} />
                )}

                <div className="flex items-center gap-3">
                  {["pending", "accepted"].includes(r.status) && (
                    <button onClick={() => handleCancel(r.id)} className="text-xs font-semibold text-signal hover:text-brand-dark underline">
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
          <span className="text-xs text-slate dark:text-slate-light">Your rating:</span>
          <StarRating value={ride.review_rating} readOnly size={14} />
        </div>
        {ride.review_comment && <p className="text-xs text-slate dark:text-slate-light italic">"{ride.review_comment}"</p>}
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
      <div className="text-xs font-medium text-ink dark:text-paper mb-2">Rate this trip</div>
      <StarRating value={rating} onChange={setRating} size={20} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 1000))}
        placeholder="Optional comment"
        rows={2}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-2"
      />
      {error && <p className="text-xs text-signal mt-1">{error}</p>}
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

function RidePayment({ ride, walletBalance, paying, onPay }) {
  const insufficientWallet = walletBalance < ride.price;
  return (
    <div className="border-t border-slate-100 mt-3 pt-3">
      <div className="text-xs font-medium text-ink dark:text-paper mb-2">
        Trip ended — pay ₦{ride.price.toLocaleString()} to close it out
      </div>
      <div className="flex gap-2">
        <Button variant="dark" size="sm" loading={paying} loadingText="Starting checkout…" onClick={() => onPay("paystack")} fullWidth>
          Pay with card
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={paying}
          loadingText="Paying…"
          disabled={insufficientWallet}
          onClick={() => onPay("wallet")}
          title={insufficientWallet ? "Insufficient wallet balance" : undefined}
          fullWidth
        >
          {`Wallet (₦${walletBalance.toLocaleString()})`}
        </Button>
      </div>
      {insufficientWallet && (
        <p className="text-xs text-signal mt-1.5">Insufficient wallet balance for this trip — pay with card instead.</p>
      )}
    </div>
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
