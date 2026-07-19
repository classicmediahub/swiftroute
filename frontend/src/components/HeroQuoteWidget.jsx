import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import AddressAutocomplete from "./AddressAutocomplete";

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
    <div className="bg-white rounded-2xl p-4 shadow-xl space-y-2.5">
      <AddressAutocomplete
        value={pickup}
        onSelect={setPickup}
        placeholder="Pickup location"
        icon={<span className="w-2.5 h-2.5 rounded-full bg-signal shrink-0" />}
      />
      <AddressAutocomplete
        value={dropoff}
        onSelect={setDropoff}
        placeholder="Drop-off location"
        icon={<span className="w-2.5 h-2.5 rounded-sm bg-delivered shrink-0" />}
      />

      {price !== null && (
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-xs text-slate">Estimated price</span>
          <span className="font-mono font-semibold text-ink">₦{price.toLocaleString()}</span>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!pickup || !dropoff || loading}
        className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Getting price…" : "See prices"}
      </button>
    </div>
  );
}
