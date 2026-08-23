import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserCheck, Users, Package, Car } from "lucide-react";

const CATEGORY_ICON = { agent: UserCheck, customer: Users, delivery: Package, ride: Car };
const CATEGORY_LABEL = { agent: "Agent", customer: "Customer", delivery: "Delivery", ride: "Ride" };

// Plain substring matching, deliberately not a real fuzzy-match algorithm
// (Levenshtein, etc.) — for names, phone numbers, and tracking codes,
// "does the text contain what was typed" is both simpler to reason about
// and, in practice, what people actually expect when they half-remember
// a code or a name.
function buildIndex({ agents, customers, deliveries, rides }) {
  const items = [];
  agents.forEach((a) =>
    items.push({
      id: `agent-${a.id}`,
      category: "agent",
      tabKey: "agents",
      title: a.full_name,
      subtitle: a.phone || a.email,
      searchText: `${a.full_name || ""} ${a.phone || ""} ${a.email || ""}`.toLowerCase(),
    })
  );
  customers.forEach((c) =>
    items.push({
      id: `customer-${c.id}`,
      category: "customer",
      tabKey: "customers",
      title: c.full_name,
      subtitle: c.phone || c.email,
      searchText: `${c.full_name || ""} ${c.phone || ""} ${c.email || ""}`.toLowerCase(),
    })
  );
  deliveries.forEach((d) =>
    items.push({
      id: `delivery-${d.id}`,
      category: "delivery",
      tabKey: "deliveries",
      title: d.tracking_code,
      subtitle: `${d.pickup_city || "?"} → ${d.dropoff_city || "?"}${d.recipient_name ? ` · ${d.recipient_name}` : ""}`,
      searchText: `${d.tracking_code || ""} ${d.pickup_city || ""} ${d.dropoff_city || ""} ${d.recipient_name || ""}`.toLowerCase(),
    })
  );
  rides.forEach((r) =>
    items.push({
      id: `ride-${r.id}`,
      category: "ride",
      tabKey: "rides",
      title: `${r.pickup_address || "?"} → ${r.dropoff_address || "?"}`,
      subtitle: r.customer_name || "",
      searchText: `${r.pickup_address || ""} ${r.dropoff_address || ""} ${r.customer_name || ""}`.toLowerCase(),
    })
  );
  return items;
}

// Controlled from outside (open/onClose) rather than owning its own
// visibility — the Cmd+K keyboard listener that toggles it needs to live
// at the page level anyway (it has to work regardless of what's focused),
// so the parent already has to track "is it open" itself.
export default function CommandPalette({ open, onClose, agents, customers, deliveries, rides, onSelect }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const index = useMemo(() => buildIndex({ agents, customers, deliveries, rides }), [agents, customers, deliveries, rides]);

  const results = useMemo(() => {
    if (!query.trim()) return index.slice(0, 8); // a short "browse" list before anyone's typed anything
    const q = query.trim().toLowerCase();
    return index.filter((item) => item.searchText.includes(q)).slice(0, 20);
  }, [query, index]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Keep the highlighted row scrolled into view during keyboard navigation
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.children[activeIndex];
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[activeIndex]) {
          onSelect(results[activeIndex]);
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, results, activeIndex, onSelect, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-24 px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-white dark:bg-ink-soft rounded-2xl shadow-2xl border border-slate-200 dark:border-line overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-line">
          <Search className="w-4 h-4 text-slate dark:text-slate-light shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, customers, deliveries, rides…"
            className="flex-1 bg-transparent outline-none text-sm text-ink dark:text-paper placeholder:text-slate-light"
          />
          <kbd className="text-[10px] font-mono text-slate-light border border-slate-200 dark:border-line rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate dark:text-slate-light">No matches found.</div>
          ) : (
            results.map((item, i) => {
              const Icon = CATEGORY_ICON[item.category];
              const active = i === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    active ? "bg-route/15" : "hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      active ? "bg-route text-ink" : "bg-brand-blue/10 text-brand-blue"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink dark:text-paper truncate">{item.title || "—"}</span>
                    {item.subtitle && <span className="block text-xs text-slate dark:text-slate-light truncate">{item.subtitle}</span>}
                  </span>
                  <span className="text-[10px] font-mono text-slate-light uppercase shrink-0">{CATEGORY_LABEL[item.category]}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-200 dark:border-line text-[10px] text-slate-light font-mono">
          <span className="flex items-center gap-1"><kbd className="border border-slate-200 dark:border-line rounded px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="border border-slate-200 dark:border-line rounded px-1">↵</kbd> select</span>
        </div>
      </div>
    </div>
  );
}
