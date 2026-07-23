import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const THEMES = {
  light: {
    container:
      "flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink",
    input: "flex-1 text-sm outline-none bg-transparent text-ink placeholder:text-slate-light",
    loading: "text-xs text-slate",
  },
  dark: {
    container:
      "flex items-center gap-2 bg-[#1B2436] border border-transparent rounded-lg px-3.5 py-2.5 focus-within:border-route focus-within:ring-1 focus-within:ring-route",
    input: "flex-1 text-sm outline-none bg-transparent text-paper placeholder:text-slate-light",
    loading: "text-xs text-slate-light",
  },
};

// theme="light" (default) is the original styling, used everywhere this
// component already appears. theme="dark" is additive, for use on dark
// panels like the hero card — nothing existing changes unless it opts in.
export default function AddressAutocomplete({ value, onSelect, placeholder, icon, theme = "light" }) {
  const [text, setText] = useState(value?.label || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const styles = THEMES[theme] || THEMES.light;

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (text.length < 3 || (value && value.label === text)) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .publicAutocomplete(text)
        .then((res) => {
          setSuggestions(res.suggestions);
          setOpen(res.suggestions.length > 0);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function handleSelect(suggestion) {
    setText(suggestion.label);
    setOpen(false);
    onSelect(suggestion);
  }

  function handleChange(e) {
    setText(e.target.value);
    if (value) onSelect(null); // typing again invalidates the previously confirmed selection
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={styles.container}>
        {icon}
        <input
          value={text}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={styles.input}
        />
        {loading && <span className={styles.loading}>…</span>}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3.5 py-2.5 text-sm text-ink hover:bg-paper transition-colors border-b border-slate-100 last:border-b-0"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
