import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const CITIES = ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];
const VEHICLES = [
  { value: "any", label: "Any available" },
  { value: "self", label: "Self" },
  { value: "bike", label: "Bike" },
  { value: "cab", label: "Cab" },
];

export default function PriceCalculator() {
  const [pickup, setPickup] = useState("Lagos");
  const [dropoff, setDropoff] = useState("Lagos");
  const [vehicle, setVehicle] = useState("any");
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .publicEstimate({ pickup_city: pickup, dropoff_city: dropoff, preferred_vehicle: vehicle })
        .then((res) => setPrice(res.price))
        .catch(() => setPrice(null))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [pickup, dropoff, vehicle]);

  return (
    <div id="calculator" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 scroll-mt-24">
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1.5">Pickup city</span>
          <select value={pickup} onChange={(e) => setPickup(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none">
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1.5">Drop-off city</span>
          <select value={dropoff} onChange={(e) => setDropoff(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none">
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1.5">Vehicle</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none">
            {VEHICLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-paper border border-slate-200 rounded-xl px-5 py-4">
        <div>
          <div className="text-xs text-slate mb-1">Estimated price</div>
          <div className="font-mono font-semibold text-2xl">
            {loading ? "…" : price !== null ? `₦${price.toLocaleString()}` : "—"}
          </div>
        </div>
        <Link
          to="/signup/customer"
          className="w-full sm:w-auto text-center bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-6 py-3 transition-colors"
        >
          Book this delivery
        </Link>
      </div>
      <p className="text-xs text-slate mt-3">Final price is confirmed at checkout based on your exact pickup and drop-off details.</p>
    </div>
  );
}
