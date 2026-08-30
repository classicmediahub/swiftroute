import { useState } from "react";
import { api } from "../api";
import { Check } from "lucide-react";

export default function SettingsPanel({ token, user, onUpdated }) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileError("");
    if (!fullName.trim() || !phone.trim()) {
      setProfileError("Name and phone can't be empty");
      return;
    }
    setSavingProfile(true);
    try {
      await api.updateProfile(token, { full_name: fullName.trim(), phone: phone.trim() });
      await onUpdated?.();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(token, { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={handleProfileSubmit} className="border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-paper mb-4">Profile</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Email</label>
          <input
            value={user?.email || ""}
            disabled
            className="w-full border border-slate-200 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-paper dark:bg-white/5 text-slate dark:text-slate-light outline-none cursor-not-allowed"
          />
          <p className="text-xs text-slate dark:text-slate-light mt-1">Email can't be changed here — contact support if you need this updated.</p>
        </div>

        {profileError && <p className="text-xs text-red-600 mb-3">{profileError}</p>}

        <div className="flex items-center gap-3">
          <button
            disabled={savingProfile}
            className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
          {profileSaved && (
            <span className="text-xs text-delivered flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>
          )}
        </div>
      </form>

      <form onSubmit={handlePasswordSubmit} className="border border-slate-200 dark:border-line rounded-2xl p-6 bg-white dark:bg-ink-soft">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-paper mb-4">Change password</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">New password</label>
          <input
            type="password"
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-ink dark:text-paper mb-1.5">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none"
          />
        </div>

        {passwordError && <p className="text-xs text-red-600 mb-3">{passwordError}</p>}

        <div className="flex items-center gap-3">
          <button
            disabled={savingPassword || !currentPassword || !newPassword}
            className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
          >
            {savingPassword ? "Updating…" : "Update password"}
          </button>
          {passwordSaved && (
            <span className="text-xs text-delivered flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Password updated</span>
          )}
        </div>
      </form>
    </div>
  );
}
