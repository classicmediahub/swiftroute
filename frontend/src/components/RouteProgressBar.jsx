import { useNavigation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

// Thin animated bar at the very top of the screen during route
// transitions — same trick YouTube/GitHub/Notion use so navigation always
// gives *some* immediate feedback, even when the actual load is fast
// enough that a full loading state would just flash uselessly.
//
// useNavigation() is the React Router data-router hook for exactly this —
// its `state` is "idle" once nothing's in flight, or "loading"/
// "submitting" while a route transition (or an action) is under way. This
// app already relies on data-router features (errorElement, on the same
// route config in App.jsx), so this hook is available with no extra setup.
export default function RouteProgressBar() {
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    if (isLoading) {
      clearTimeout(hideTimeoutRef.current);
      setVisible(true);
      setProgress(10); // jump-start so the very first frame already shows motion

      // Eases toward 90% and deliberately never reaches 100% on its own —
      // only the real navigation actually finishing (isLoading -> false)
      // is allowed to complete the bar. A bar that reaches 100% by itself
      // while still loading would be lying about being done.
      let current = 10;
      intervalRef.current = setInterval(() => {
        current += (90 - current) * 0.1;
        setProgress(current);
      }, 200);
    } else {
      clearInterval(intervalRef.current);
      setProgress((p) => {
        if (p === 0) return 0; // wasn't loading before either — nothing to complete
        hideTimeoutRef.current = setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 300); // let the completed/fading bar be visible briefly, not an instant snap-to-nothing
        return 100;
      });
    }
    return () => clearInterval(intervalRef.current);
  }, [isLoading]);

  useEffect(() => () => clearTimeout(hideTimeoutRef.current), []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none" aria-hidden="true">
      <div
        className="h-full bg-route transition-[width,opacity] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          boxShadow: "0 0 8px var(--color-route)",
        }}
      />
    </div>
  );
}
