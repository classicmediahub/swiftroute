import { useState } from "react";

// Rough average price per job, by vehicle type — derived from pricing.js's
// real fare formula (BASE_FARE + PER_KM_RATE * distance), assuming a
// typical ~6km intra-city trip. Deliberately labeled as an estimate in the
// UI, not a promise — actual per-job pay varies with real distance.
const AVG_PRICE_PER_JOB = {
  self: 1100,  // 500 + 6*100
  bike: 1280,  // 500 + 6*130
  cab: 1820,   // 500 + 6*220
};
const AGENT_CUT = 0.8; // same 80% split used throughout rides.js/deliveries
const WORK_DAYS_PER_WEEK = 6;

const VEHICLES = [
  { value: "self", label: "Self" },
  { value: "bike", label: "Bike" },
  { value: "cab", label: "Cab" },
];

export default function EarningsCalculator() {
  const [vehicle, setVehicle] = useState("bike");
  const [jobsPerDay, setJobsPerDay] = useState(6);

  const perJobEarning = Math.round(AVG_PRICE_PER_JOB[vehicle] * AGENT_CUT);
  const daily = perJobEarning * jobsPerDay;
  const weekly = daily * WORK_DAYS_PER_WEEK;
  const monthly = Math.round((weekly * 52) / 12);

  return (
    <div className="border border-slate-200 rounded-2xl p-6 bg-white">
      <div className="font-mono text-xs text-slate mb-1">ESTIMATE ONLY</div>
      <h3 className="font-display text-xl font-semibold mb-4">What could you earn?</h3>

      <div className="flex gap-2 mb-5">
        {VEHICLES.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setVehicle(v.value)}
            className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
              vehicle === v.value ? "border-ink bg-ink text-paper" : "border-slate-300 text-slate hover:border-slate-400"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="jobs-per-day" className="text-sm text-slate">Jobs per day</label>
          <span className="font-mono text-sm font-semibold">{jobsPerDay}</span>
        </div>
        <input
          id="jobs-per-day"
          type="range"
          min="1"
          max="15"
          step="1"
          value={jobsPerDay}
          onChange={(e) => setJobsPerDay(Number(e.target.value))}
          className="w-full accent-route"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <EstimateCard label="Per day" value={daily} />
        <EstimateCard label="Per week" value={weekly} />
        <EstimateCard label="Per month" value={monthly} />
      </div>

      <p className="text-xs text-slate">
        Based on an average ₦{AVG_PRICE_PER_JOB[vehicle].toLocaleString()} job for a {vehicle} agent and
        PickAndEarn's {AGENT_CUT * 100}% agent split, {WORK_DAYS_PER_WEEK} days a week. Real earnings depend on
        actual distance, demand in your area, and how often you're online — this is a starting-point estimate,
        not a guarantee.
      </p>
    </div>
  );
}

function EstimateCard({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <div className="text-xs text-slate mb-1">{label}</div>
      <div className="font-mono font-semibold text-sm">₦{value.toLocaleString()}</div>
    </div>
  );
}
