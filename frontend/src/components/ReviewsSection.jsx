import { useEffect, useState } from "react";
import { api } from "../api";
import StarRating from "./StarRating";

export default function ReviewsSection() {
  const [reviews, setReviews] = useState(null);

  useEffect(() => {
    api.publicReviews().then(setReviews).catch(() => setReviews([]));
  }, []);

  // Nothing to show yet — skip the section entirely rather than displaying
  // an empty or placeholder state where real testimonials should be.
  if (!reviews || reviews.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-5 py-16">
      <div className="font-mono text-xs text-slate mb-2">FROM OUR CUSTOMERS</div>
      <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-10">What people are saying</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {reviews.map((r, i) => (
          <div key={i} className="border border-slate-200 rounded-2xl p-6 bg-white">
            <StarRating value={r.rating} readOnly size={16} />
            <p className="text-sm text-ink mt-3 mb-4">"{r.comment}"</p>
            <div className="text-xs text-slate font-mono">— {r.customer_name.split(" ")[0]}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
