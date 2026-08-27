import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { ShieldAlert, Check } from "lucide-react";

export default function EmergencyContactCard({ token }) {
  const [contact, setContact] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(() => {
    api.getEmergencyContact(token).then((d) => {
      setContact(d);
      setForm({ name: d.emergency_contact_name || "", phone: d.emergency_contact_phone || "" });
    }).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.saveEmergencyContact(token, form);
      setContact({ emergency_contact_name: form.name, emergency_contact_phone: form.phone });
      setEditing(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!contact) return null;
  const hasContact = Boolean(contact.emergency_contact_phone);

  return (
    <div className="border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
        <div className="text-xs text-slate dark:text-slate-light">Emergency contact</div>
      </div>

      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          {hasContact ? (
            <div className="text-sm text-ink dark:text-paper min-w-0">
              <span className="font-semibold">{contact.emergency_contact_name}</span> · {contact.emergency_contact_phone}
            </div>
          ) : (
            <div className="text-sm text-slate dark:text-slate-light">
              Add someone we can reach if you ever hit the SOS button on a trip.
            </div>
          )}
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-route-dark hover:underline shrink-0">
            {hasContact ? "Change" : "Add contact"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <input
            required
            placeholder="Contact's full name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
          <input
            required
            placeholder="Their phone number"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              disabled={saving}
              className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper">
              Cancel
            </button>
          </div>
        </form>
      )}
      {justSaved && (
        <p className="text-xs text-delivered mt-2 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</p>
      )}
    </div>
  );
}
