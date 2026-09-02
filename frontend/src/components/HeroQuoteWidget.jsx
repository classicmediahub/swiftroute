import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AddressAutocomplete from "./AddressAutocomplete";

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13a9 9 0 0 1 18 0" />
      <rect x="3" y="13" width="5" height="7" rx="1.5" />
      <rect x="16" y="13" width="5" height="7" rx="1.5" />
      <path d="M21 20v1a3 3 0 0 1-3 3h-3" />
    </svg>
  );
}

const MODES = [
  { id: "delivery", label: "Delivery" },
  { id: "ride", label: "Ride" },
  { id: "food", label: "Food" },
  { id: "gas", label: "Gas" },
];

// No public gas-pricing endpoint exists yet, so gas mode deliberately
// skips a live quote — just a size picker to orient a first-time visitor,
// same spirit as food mode skipping a quote entirely (food pricing only
// makes sense once you've picked an outlet and items, which is what
// /food's own browse flow is for). A live gas quote can be added later
// by mirroring /public/estimate and /public/estimate-ride.
const GAS_SIZES = [3, 6, 12.5, 25, 50];

export default function HeroQuoteWidget() {
  const [mode, setMode] = useState("delivery");
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cylinderSize, setCylinderSize] = useState(GAS_SIZES[1]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const isQuoteMode = mode === "delivery" || mode === "ride";

  useEffect(() => {
    if (!isQuoteMode || !pickup || !dropoff) {
      setPrice(null);
      return;
    }
    setLoading(true);
    const request =
      mode === "ride"
        ? api.publicRideEstimate({ pickup_coords: pickup, dropoff_coords: dropoff })
        : api.publicEstimate({
            pickup_coords: pickup,
            dropoff_coords: dropoff,
            pickup_city: pickup.city,
            dropoff_city: dropoff.city,
            preferred_vehicle: "any",
          });

    request
      .then((res) => setPrice(res.price))
      .catch(() => setPrice(null))
      .finally(() => setLoading(false));
  }, [pickup, dropoff, mode, isQuoteMode]);

  function handleModeChange(next) {
    if (next === mode) return;
    setMode(next);
    setPrice(null); // re-fetches under the new mode's pricing once both points are still set (quote modes only)
  }

  function handleContinue() {
    if (mode === "food") {
      // Browsing restaurants/shops never requires login — same as
      // clicking "Browse food & groceries" elsewhere on this page.
      navigate("/food");
      return;
    }

    if (mode === "gas") {
      navigate(user?.role === "customer" ? "/gas" : "/signup/customer");
      return;
    }

    // Delivery / ride — a signed-in customer continues straight to the
    // right page instead of being sent through signup again. Coordinates
    // picked here aren't carried over — the destination pages use their
    // own location pickers, a different component than this widget's
    // AddressAutocomplete, so re-confirming there is required either way;
    // this is purely about not forcing an already-logged-in customer
    // through signup a second time.
    if (user?.role === "customer") {
      navigate(mode === "ride" ? "/rides" : "/customer/dashboard");
    } else {
      navigate("/signup/customer");
    }
  }

  const continueLabel = isQuoteMode
    ? (loading ? "Getting price…" : "See prices")
    : mode === "food"
    ? "Browse restaurants & shops"
    : user?.role === "customer"
    ? "Order gas"
    : "Sign up to order gas";

  const continueDisabled = isQuoteMode ? (!pickup || !dropoff || loading) : false;

  return (
    // Slightly lighter than the hero's own background (not the same dark
    // shade as the mockup) so this still reads as a distinct panel against
    // the dark hero, rather than blending into it.
    <div className="bg-ink-soft border border-line rounded-2xl p-5 shadow-xl space-y-3">
      <div className="grid grid-cols-4 gap-1 bg-black/20 rounded-lg p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => handleModeChange(m.id)}
            className={`text-center text-xs font-semibold px-2 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              mode === m.id ? "bg-route text-ink" : "text-slate-light hover:text-paper"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isQuoteMode && (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 min-w-0">
            <AddressAutocomplete
              value={pickup}
              onSelect={setPickup}
              placeholder="Pickup location"
              theme="dark"
              icon={<span className="w-2.5 h-2.5 rounded-full bg-signal shrink-0" />}
            />
          </div>
          <div className="flex-1 min-w-0">
            <AddressAutocomplete
              value={dropoff}
              onSelect={setDropoff}
              placeholder="Drop-off location"
              theme="dark"
              icon={<span className="w-2.5 h-2.5 rounded-sm bg-delivered shrink-0" />}
            />
          </div>
        </div>
      )}

      {mode === "food" && (
        <p className="text-xs text-slate-light px-1">
          Real menus from restaurants, eateries, and supermarkets near you — order and pay in the app.
        </p>
      )}

      {mode === "gas" && (
        <div>
          <div className="text-xs text-slate-light mb-2 px-1">Cylinder size</div>
          <div className="flex flex-wrap gap-2">
            {GAS_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setCylinderSize(size)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  cylinderSize === size
                    ? "bg-route text-ink border-route"
                    : "border-line text-slate-light hover:text-paper"
                }`}
              >
                {size}kg
              </button>
            ))}
          </div>
        </div>
      )}

      {isQuoteMode && price !== null && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-light">Estimated price</span>
          <span className="font-mono font-semibold text-paper">₦{price.toLocaleString()}</span>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={continueDisabled}
        className="btn-tactile w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {continueLabel}
      </button>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
        <span className="flex items-center gap-1.5 text-xs text-slate-light">
          <ShieldIcon /> {mode === "food" ? "Verified outlets" : mode === "gas" ? "Verified gas agents" : "ID-verified riders"}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-light">
          <HeadsetIcon />{" "}
          {mode === "ride"
            ? "Live tracking on every trip"
            : mode === "food"
            ? "Live order tracking"
            : mode === "gas"
            ? "Same-day refills available"
            : "Parcels insured up to ₦50,000"}
        </span>
      </div>
    </div>
  );
}
