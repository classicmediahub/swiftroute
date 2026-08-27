import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";

const POLL_INTERVAL_MS = 4000;

// Polling rather than WebSockets — matches how live location already
// works in this app (useLiveLocation/useRideLocation), so no new
// server infrastructure (no socket server, no sticky sessions on
// Render) is needed to ship this. If message volume ever justifies it,
// this is the one spot that would need to change to a socket-based
// implementation — everything using this hook stays the same.
export function useTripChat(token, tripType, tripId, { enabled = true } = {}) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastTimestampRef = useRef(null);

  // Initial load — full history, once, whenever the trip changes.
  useEffect(() => {
    if (!enabled || !tripId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    lastTimestampRef.current = null;
    api.getMessages(token, tripType, tripId)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        if (data.messages.length > 0) {
          lastTimestampRef.current = data.messages[data.messages.length - 1].created_at;
        }
        setError("");
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token, tripType, tripId, enabled]);

  // Incremental polling — only fetches messages newer than the last one
  // we already have, not the whole thread every 4 seconds.
  const poll = useCallback(async () => {
    if (!enabled || !tripId) return;
    try {
      const data = await api.getMessages(token, tripType, tripId, lastTimestampRef.current);
      if (data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
        lastTimestampRef.current = data.messages[data.messages.length - 1].created_at;
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [token, tripType, tripId, enabled]);

  useEffect(() => {
    if (!enabled || !tripId) return;
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll, enabled, tripId]);

  const send = useCallback(async (body) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(token, tripType, tripId, trimmed);
      setMessages((prev) => [...prev, msg]);
      lastTimestampRef.current = msg.created_at;
      setError("");
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSending(false);
    }
  }, [token, tripType, tripId]);

  const markRead = useCallback(() => {
    if (!tripId) return;
    api.markMessagesRead(token, tripType, tripId).catch(() => {});
  }, [token, tripType, tripId]);

  return { messages, loading, error, sending, send, markRead };
}
