import { useEffect, useState, useCallback } from "react";
import { api } from "../api";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export default function ApiSettings({ token }) {
  const [keys, setKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [justCreated, setJustCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState(null);
  const [error, setError] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  const loadKeys = useCallback(() => {
    api.listApiKeys(token).then(setKeys).catch(() => {});
  }, [token]);

  useEffect(() => {
    loadKeys();
    api.getWebhook(token).then((w) => {
      setWebhookUrl(w.webhook_url || "");
      setWebhookSecret(w.webhook_secret);
    }).catch(() => {});
  }, [token, loadKeys]);

  async function handleCreateKey(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api.createApiKey(token, newKeyLabel || "Untitled key");
      setJustCreated(data);
      setNewKeyLabel("");
      loadKeys();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevoke(id) {
    if (!confirm("Revoke this API key? Anything using it will stop working immediately.")) return;
    try {
      await api.revokeApiKey(token, id);
      loadKeys();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSaveWebhook(e) {
    e.preventDefault();
    setError("");
    setSavingWebhook(true);
    try {
      const data = await api.setWebhook(token, webhookUrl);
      setWebhookSecret(data.webhook_secret);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingWebhook(false);
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(justCreated.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* API Keys */}
      <div className="border border-slate-200 rounded-2xl p-6 bg-white">
        <h2 className="font-display text-lg font-semibold mb-1">API keys</h2>
        <p className="text-sm text-slate mb-4">Use a key to create and track deliveries from your own store or backend — see the docs below.</p>

        {justCreated && (
          <div className="border border-route bg-amber-50 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-ink mb-2">Copy this key now — you won't be able to see it again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono overflow-x-auto whitespace-nowrap">
                {justCreated.key}
              </code>
              <button onClick={copyKey} className="text-xs font-semibold bg-ink text-paper rounded-lg px-3 py-2 shrink-0 hover:bg-ink-soft transition-colors">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreateKey} className="flex gap-2 mb-4">
          <input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="Label, e.g. 'My Shopify Store'"
            className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none"
          />
          <button className="bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2 text-sm transition-colors">
            Generate key
          </button>
        </form>
        {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

        {keys.length === 0 ? (
          <p className="text-sm text-slate">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-2.5">
                <div>
                  <div className="text-sm font-medium text-ink">{k.label}</div>
                  <div className="text-xs text-slate font-mono">
                    {k.key_prefix}… · {k.revoked ? "revoked" : k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}
                  </div>
                </div>
                {!k.revoked && (
                  <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-600 font-medium hover:underline">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook */}
      <div className="border border-slate-200 rounded-2xl p-6 bg-white">
        <h2 className="font-display text-lg font-semibold mb-1">Webhook</h2>
        <p className="text-sm text-slate mb-4">
          Get notified automatically when a delivery's status changes — useful for auto-updating order status in your own store.
        </p>
        <form onSubmit={handleSaveWebhook} className="flex gap-2 mb-2">
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://yourstore.com/webhooks/pickandearn"
            className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none"
          />
          <button disabled={savingWebhook} className="bg-ink hover:bg-ink-soft text-paper font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60">
            {savingWebhook ? "Saving…" : "Save"}
          </button>
        </form>
        {webhookSecret && (
          <div className="text-xs text-slate">
            Signing secret: <code className="font-mono bg-paper border border-slate-200 rounded px-2 py-0.5">{webhookSecret}</code>
            <p className="mt-1">Use this to verify the <code className="font-mono">X-PickAndEarn-Signature</code> header on incoming webhook requests (HMAC-SHA256 of the raw request body).</p>
          </div>
        )}
      </div>

      {/* Docs */}
      <div className="border border-slate-200 rounded-2xl p-6 bg-ink text-paper">
        <h2 className="font-display text-lg font-semibold mb-1">Quick integration guide</h2>
        <p className="text-sm text-slate-light mb-4">Call these from your own server — never from browser-side JavaScript, since that would expose your API key.</p>

        <div className="mb-4">
          <div className="font-mono text-xs text-route mb-1.5">Get a price quote</div>
          <pre className="bg-ink-soft rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`curl -X POST ${API_BASE}/v1/estimate \\
  -H "Authorization: Bearer pae_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"pickup_city":"Lagos","dropoff_city":"Lagos"}'`}
          </pre>
        </div>

        <div className="mb-4">
          <div className="font-mono text-xs text-route mb-1.5">Create a delivery (paid from your wallet)</div>
          <pre className="bg-ink-soft rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`curl -X POST ${API_BASE}/v1/deliveries \\
  -H "Authorization: Bearer pae_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "package_type": "Documents",
    "pickup_address": "12 Allen Ave",
    "pickup_city": "Lagos",
    "dropoff_address": "5 Admiralty Way",
    "dropoff_city": "Lagos",
    "recipient_name": "John Doe",
    "recipient_phone": "08099998888",
    "order_reference": "SHOPIFY-1001"
  }'`}
          </pre>
        </div>

        <div>
          <div className="font-mono text-xs text-route mb-1.5">Check delivery status</div>
          <pre className="bg-ink-soft rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`curl ${API_BASE}/v1/deliveries/PAE-XXXXXXX \\
  -H "Authorization: Bearer pae_live_..."`}
          </pre>
        </div>
      </div>
    </div>
  );
}
