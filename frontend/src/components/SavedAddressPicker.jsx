import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { MapPin, Plus, X } from "lucide-react";

// Drop into any checkout form that has its own address/city/landmark
// state. This component never owns that state itself — it only reads the
// CURRENT values (to offer "save this") and calls onSelect with a full
// saved address object when one is picked, letting the parent form fill
// its own fields however it already does.
export default function SavedAddressPicker({ token, onSelect, currentAddress, currentCity, currentLandmark }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.listSavedAddresses(token).then(setAddresses).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (!label.trim() || !currentAddress?.trim() || !currentCity) return;
    setSaving(true);
    try {
      await api.saveAddress(token, { label: label.trim(), address: currentAddress, city: currentCity, landmark: currentLandmark || null });
      setLabel("");
      setShowSaveForm(false);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    try {
      await api.deleteSavedAddress(token, id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return null;

  const canSaveCurrent = Boolean(currentAddress?.trim() && currentCity);

  return (
    <div className="mb-4">
      {addresses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {addresses.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a)}
              className="group flex items-center gap-1.5 text-xs font-medium border border-slate-300 dark:border-line rounded-full pl-3 pr-2 py-1.5 text-ink dark:text-paper hover:border-ink dark:hover:border-paper transition-colors"
            >
              <MapPin className="w-3 h-3 text-route-dark shrink-0" />
              {a.label}
              <span
                onClick={(e) => handleDelete(a.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity ml-0.5"
                role="button"
                aria-label={`Remove ${a.label}`}
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {!showSaveForm ? (
        canSaveCurrent && (
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            className="flex items-center gap-1 text-xs font-semibold text-route-dark hover:underline"
          >
            <Plus className="w-3 h-3" /> Save this address for next time
          </button>
        )
      ) : (
        <form onSubmit={handleSave} className="flex gap-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. Home, Hostel"
            className="flex-1 border border-slate-300 dark:border-line rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-ink outline-none"
          />
          <button
            disabled={saving || !label.trim()}
            className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-60"
          >
            {saving ? "…" : "Save"}
          </button>
          <button type="button" onClick={() => setShowSaveForm(false)} className="text-xs text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
