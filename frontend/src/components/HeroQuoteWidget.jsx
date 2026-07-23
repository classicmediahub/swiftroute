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
    api
      .publicEstimate({
        pickup_coords: pickup,
        dropoff_coords: dropoff,
        pickup_city: pickup.city,
        dropoff_city: dropoff.city,
        preferred_vehicle: "any",
      })
      .then((res) => setPrice(res.price))
      .catch(() => setPrice(null))
      .finally(() => setLoading(false));
  }, [pickup, dropoff]);

  function handleContinue() {
    navigate("/signup/customer");
  }

  return (
    // Slightly lighter than the hero's own background (not the same dark
    // shade as the mockup) so this still reads as a distinct panel against
    // the dark hero, rather than blending into it.
    <div className="bg-[#141d30] border border-line rounded-2xl p-5 shadow-xl space-y-3">
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
          <HeadsetIcon /> Parcels insured up to ₦50,000
        </span>
      </div>
    </div>
  );
}
