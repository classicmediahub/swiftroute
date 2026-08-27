import { useEffect, useRef, useState } from "react";
import { useTripChat } from "../hooks/useTripChat";
import { Send, MessageCircle } from "lucide-react";

// Drop this into whichever screen shows an active ride/delivery's details,
// on both the customer and agent side. Example:
//   <ChatPanel token={token} tripType="ride" tripId={ride.id} myRole="customer" otherPartyName={ride.agent_name} />
export default function ChatPanel({ token, tripType, tripId, myRole, otherPartyName, disabled }) {
  const { messages, loading, error, sending, send, markRead } = useTripChat(token, tripType, tripId, {
    enabled: !disabled,
  });
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length > 0) markRead();
  }, [messages, markRead]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const toSend = draft;
    setDraft(""); // optimistic clear — feels instant even while the request is in flight
    try {
      await send(toSend);
    } catch {
      setDraft(toSend); // put it back so nothing typed is lost on failure
    }
  }

  return (
    <div className="border border-slate-200 dark:border-line rounded-2xl bg-white dark:bg-ink-soft flex flex-col h-96 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-line shrink-0">
        <MessageCircle className="w-4 h-4 text-route-dark shrink-0" />
        <div className="text-sm font-semibold text-ink dark:text-paper truncate">
          {otherPartyName ? `Chat with ${otherPartyName}` : "Chat"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <p className="text-xs text-slate dark:text-slate-light text-center mt-8">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate dark:text-slate-light text-center mt-8">
            No messages yet — say hello 👋
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === myRole;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "bg-route text-ink rounded-br-sm"
                      : "bg-paper dark:bg-white/10 text-ink dark:text-paper rounded-bl-sm"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`text-[10px] mt-0.5 ${mine ? "text-ink/60" : "text-slate dark:text-slate-light"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-xs text-red-600 px-4 pb-1">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-slate-100 dark:border-line shrink-0">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Chat is closed for this trip" : "Type a message…"}
          maxLength={1000}
          className="flex-1 border border-slate-300 dark:border-line rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-ink outline-none disabled:opacity-60"
        />
        <button
          disabled={disabled || !draft.trim() || sending}
          className="shrink-0 flex items-center justify-center w-10 h-10 bg-route hover:bg-route-dark text-ink rounded-lg transition-colors disabled:opacity-60"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
