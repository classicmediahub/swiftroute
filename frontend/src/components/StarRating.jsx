import { Star } from "lucide-react";

export default function StarRating({ value, onChange, size = 20, readOnly = false }) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex items-center gap-1" role={readOnly ? undefined : "radiogroup"} aria-label="Rating">
      {stars.map((star) => {
        const filled = star <= value;
        if (readOnly) {
          return (
            <Star
              key={star}
              size={size}
              className={filled ? "text-route fill-route" : "text-slate-300"}
            />
          );
        }
        return (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            onClick={() => onChange(star)}
            className="transition-transform hover:scale-110"
          >
            <Star size={size} className={filled ? "text-route fill-route" : "text-slate-300"} />
          </button>
        );
      })}
    </div>
  );
}
