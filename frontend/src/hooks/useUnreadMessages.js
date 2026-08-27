import { useState, useEffect } from "react";
import { api } from "../api";

const POLL_INTERVAL_MS = 15000; // lighter than the per-chat poll — this just feeds a badge, not a live thread

export function useUnreadMessages(token, enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    const check = () => {
      api.unreadMessageCount(token).then((d) => !cancelled && setCount(d.count)).catch(() => {});
    };
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, enabled]);

  return count;
}
