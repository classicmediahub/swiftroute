import { useState } from "react";
import { api } from "../api";
import StarRating from "./StarRating";

export default function ReviewForm({ deliveryId, token, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (rating === 0) {
      setError("Pick a star rating first.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api.submitReview(token, deliveryId, { rating, comment });
      onSubmitted();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-100 mt-3 pt-3">
      <div className="text-xs font-medium text-ink mb-2">Rate this delivery</div>
      <div className="flex items-center gap-3 mb-2">
        <StarRating value={rating} onChange={setRating} size={22} />
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment about the agent or delivery"
        maxLength={500}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs mb-2 focus:border-ink focus:ring-1 focus:ring-ink outline-none"
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        disabled={submitting}
        className="text-xs font-semibold bg-ink hover:bg-ink-soft text-paper rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit rating"}
      </button>
    </form>
  );
}
