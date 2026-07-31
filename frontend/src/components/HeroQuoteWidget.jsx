import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
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

export default function HeroQuoteWidget() {
  const [mode, setMode] = useState("delivery"); // "delivery" | "ride"
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!pickup || !dropoff) {
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
  }, [pickup, dropoff, mode]);

  function handleModeChange(next) {
    if (next === mode) return;
    setMode(next);
    setPrice(null); // re-fetches under the new mode's pricing once both points are still set
  }

  function handleContinue() {
    // Both modes land on signup for now — same as before this toggle was
    // added. A logged-in visitor scrolling back to this widget still gets
    // sent through signup rather than straight to /rides or the delivery
    // form; that's an existing limitation of this widget, not something
    // introduced by the ride toggle, so it's left as-is here.
    navigate("/signup/customer");
  }

  return (
    // Slightly lighter than the hero's own background (not the same dark
    // shade as the mockup) so this still reads as a distinct panel against
    // the dark hero, rather than blending into it.
    <div className="bg-[#141d30] border border-line rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex gap-1.5 bg-black/20 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => handleModeChange("delivery")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
            mode === "delivery" ? "bg-route text-ink" : "text-slate-light hover:text-paper"
          }`}
        >
          Send a delivery
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("ride")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
            mode === "ride" ? "bg-route text-ink" : "text-slate-light hover:text-paper"
          }`}
        >
          Get a ride
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <AddressAutocomplete
          value={pickup}
          onSelect={setPickup}
          placeholder="Pickup location"
          theme="dark"
          icon={<span className="w-2.5 h-2.5 rounded-full bg-signal shrink-0" />}
        />
        <AddressAutocomplete
          value={dropoff}
          onSelect={setDropoff}
          placeholder="Drop-off location"
          theme="dark"
          icon={<span className="w-2.5 h-2.5 rounded-sm bg-delivered shrink-0" />}
        />
      </div>

      {price !== null && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-light">Estimated price</span>
          <span className="font-mono font-semibold text-paper">₦{price.toLocaleString()}</span>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!pickup || !dropoff || loading}
        className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Getting price…" : "See prices"}
      </button>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
        <span className="flex items-center gap-1.5 text-xs text-slate-light">
          <ShieldIcon /> ID-verified riders
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-light">
          <HeadsetIcon /> {mode === "ride" ? "Live tracking on every trip" : "Parcels insured up to ₦50,000"}
        </span>
      </div>
    </div>
  );
}
