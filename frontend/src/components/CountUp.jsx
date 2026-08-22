import { useCountUp } from "../hooks/useCountUp";

// Drop-in replacement for a plain {value} display — animates from 0 up to
// the real value once, the first time it scrolls into view. Takes a raw
// NUMBER (not a pre-formatted string like "₦1,204,500") so it can
// actually animate the underlying value; prefix/suffix/decimals handle
// the formatting that used to be baked into the string at the call site.
export default function CountUp({ value, duration = 900, decimals = 0, prefix = "", suffix = "", className = "" }) {
  const { ref, value: animated } = useCountUp(value, { duration, decimals });
  const formatted = animated.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
