import { useState } from "react";
import Papa from "papaparse";
import { api } from "../api";

const TEMPLATE_HEADERS = [
  "package_type", "pickup_address", "pickup_city", "pickup_landmark", "dropoff_address", "dropoff_city", "dropoff_landmark",
  "recipient_name", "recipient_phone", "preferred_vehicle", "package_note",
];
const TEMPLATE_EXAMPLE = [
  "Documents", "12 Allen Ave", "Lagos", "Opposite First Bank", "5 Admiralty Way", "Lagos", "Near Shoprite entrance",
  "John Doe", "08099998888", "bike", "Handle with care",
];
const REQUIRED_FIELDS = ["package_type", "pickup_address", "pickup_city", "dropoff_address", "dropoff_city", "recipient_name", "recipient_phone"];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_EXAMPLE.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pickandearn-bulk-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function validateRow(row) {
  const missing = REQUIRED_FIELDS.filter((f) => !row[f] || !String(row[f]).trim());
  return missing.length ? `Missing: ${missing.join(", ")}` : null;
}

export default function BulkUpload({ token, walletBalance, onComplete }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data;
        setRows(parsed);
        const errs = [];
        parsed.forEach((row, i) => {
          const err = validateRow(row);
          if (err) errs.push({ row: i + 1, error: err });
        });
        setRowErrors(errs);
      },
      error: (err) => setError(`Couldn't read that file: ${err.message}`),
    });
  }

  async function handleSubmit() {
    if (rows.length === 0) return;
    if (rowErrors.length > 0) {
      setError("Fix the highlighted rows before uploading.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const cleanRows = rows.map((r) => ({
        package_type: r.package_type,
        pickup_address: r.pickup_address,
        pickup_city: r.pickup_city,
        pickup_landmark: r.pickup_landmark || "",
        dropoff_address: r.dropoff_address,
        dropoff_city: r.dropoff_city,
        dropoff_landmark: r.dropoff_landmark || "",
        recipient_name: r.recipient_name,
        recipient_phone: r.recipient_phone,
        preferred_vehicle: r.preferred_vehicle || "any",
        package_note: r.package_note || "",
      }));
      const data = await api.bulkCreateDeliveries(token, cleanRows);
      setResult(data);
      setRows([]);
      setFileName("");
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-2xl p-6 bg-white">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold mb-1">Bulk upload</h2>
          <p className="text-sm text-slate">Upload a CSV of up to 100 deliveries. Paid instantly from your wallet balance.</p>
        </div>
        <button onClick={downloadTemplate} className="text-xs font-semibold text-ink border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 transition-colors shrink-0">
          Download template
        </button>
      </div>

      <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center mb-4">
        <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
        {fileName && <p className="text-xs text-slate mt-2">{fileName} · {rows.length} row{rows.length !== 1 ? "s" : ""}</p>}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {rows.length > 0 && (
        <div className="mb-4">
          <div className="overflow-x-auto border border-slate-200 rounded-xl mb-3 max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-paper text-left text-slate uppercase font-mono sticky top-0">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rowError = rowErrors.find((e) => e.row === i + 1);
                  return (
                    <tr key={i} className={`border-t border-slate-100 ${rowError ? "bg-red-50" : ""}`}>
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">{r.pickup_city} → {r.dropoff_city}</td>
                      <td className="px-3 py-2">{r.recipient_name || "—"}</td>
                      <td className="px-3 py-2 capitalize">{r.preferred_vehicle || "any"}</td>
                      <td className="px-3 py-2">
                        {rowError ? <span className="text-red-600">{rowError.error}</span> : <span className="text-delivered">OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            disabled={submitting || rowErrors.length > 0}
            onClick={handleSubmit}
            className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60"
          >
            {submitting ? "Uploading…" : `Upload ${rows.length} deliveries from wallet`}
          </button>
          <p className="text-xs text-slate mt-2">Your current wallet balance is ₦{walletBalance.toLocaleString()}. The exact charge is calculated per delivery on upload.</p>
        </div>
      )}

      {result && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
          <p className="text-sm text-emerald-800 font-medium">
            {result.count} deliveries created — ₦{result.totalCharged.toLocaleString()} charged from your wallet.
          </p>
        </div>
      )}
    </div>
  );
}
