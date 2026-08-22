import { useEffect, useRef, useState } from "react";

// Animates a number counting up from 0 to `target` the first time its
// attached element scrolls into view — not on mount, so stats further
// down a page (like AdminDashboard's, or a landing page stats bar) don't
// all animate at once off-screen before anyone's scrolled down to see them.
// Only fires once per mount (a stat re-animating every time it re-enters
// the viewport while someone scrolls up and down would be more
// distracting than delightful).
export function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const hasAnimatedRef = useRef(false);
  const rafRef = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimatedRef.current) return;
        hasAnimatedRef.current = true;
        observer.disconnect();

        const start = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — fast start, gentle settle
          setValue(target * eased);
          if (t < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            setValue(target); // guarantee it lands exactly on target, not a near-miss from float rounding
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return { ref, value: Number(value.toFixed(decimals)) };
}
