"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, useId } from "react";
import { MessageSquareText, Star } from "lucide-react";
import { api } from "@/lib/client/api";
import { useSession } from "../account/session-context";
import { Button } from "../ui/button";
import { Notice } from "../ui/feedback";
import { cn } from "../ui/cn";
import { Stars } from "./stars";

interface PublicReview { id: string; rating: number; comment: string | null; author: string; createdAt: string }
interface Eligibility {
  signedIn: boolean;
  canReview: boolean;
  reason: string | null;
  mine: { rating: number; comment: string | null; status: "pending" | "approved" | "hidden" } | null;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Approved reviews + (for customers with a delivered order of this product) a review form. */
export function ReviewsPanel({
  productId, productSlug, average, count, reviews,
}: { productId: string; productSlug: string; average: number | null; count: number; reviews: PublicReview[] }) {
  const { profile } = useSession();
  const [elig, setElig] = useState<Eligibility | null>(null);

  useEffect(() => {
    let alive = true;
    api<Eligibility>(`/api/reviews?productId=${productId}`, { cache: "no-store" })
      .then((r) => alive && setElig(r))
      .catch(() => alive && setElig(null));
    return () => {
      alive = false;
    };
  }, [productId, profile?.id]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        {count > 0 && average !== null ? (
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold tabular-nums text-forest-900">{average.toFixed(1)}</span>
            <span>
              <Stars value={average} size="size-5" />
              <span className="block text-sm text-muted">{count} {count === 1 ? "review" : "reviews"} from customers who received it</span>
            </span>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-ink-soft">
            <MessageSquareText className="size-5 text-muted" aria-hidden /> No reviews yet.
          </p>
        )}
        {reviews.length ? (
          <ul className="mt-6 divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars value={r.rating} />
                  <span className="sr-only">{r.rating} out of 5 stars</span>
                  <span className="text-sm font-semibold text-ink">{r.author}</span>
                  <span className="text-xs text-muted">{fmtDate(r.createdAt)} · Verified purchase</span>
                </div>
                {r.comment ? <p className="mt-1.5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-soft">{r.comment}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <aside aria-label="Write a review" className="h-fit rounded-[var(--radius-card)] border border-line bg-sage-50/60 p-5">
        <h3 className="font-sans text-base font-semibold text-ink">Write a review</h3>
        {!elig ? (
          <div className="skeleton mt-3 h-16 w-full" aria-hidden />
        ) : !elig.signedIn ? (
          <p className="mt-2 text-sm text-ink-soft">
            Only customers who received this product can review it.{" "}
            <Link href={`/login?next=${encodeURIComponent(`/product/${productSlug}`)}`} className="font-semibold text-leaf-600 hover:underline">Sign in</Link>
          </p>
        ) : !elig.canReview ? (
          <p className="mt-2 text-sm text-ink-soft">{elig.reason}</p>
        ) : (
          <ReviewForm productId={productId} mine={elig.mine} onSaved={(m) => setElig({ ...elig, mine: m })} />
        )}
      </aside>
    </div>
  );
}

function ReviewForm({ productId, mine, onSaved }: { productId: string; mine: Eligibility["mine"]; onSaved: (m: NonNullable<Eligibility["mine"]>) => void }) {
  // Unique radio-group names: a second copy of this form (e.g. a page kept in the background) must
  // never share them, or React refuses the click ("Mixing React and non-React radio inputs").
  const rg = useId();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) return setError("Choose 1 to 5 stars.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/reviews", { method: "POST", json: { productId, rating, comment: comment.trim() || null } });
      onSaved({ rating, comment: comment.trim() || null, status: "pending" });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      {mine && !saved ? (
        <p className="text-xs text-muted">
          Your review is {mine.status === "approved" ? "published" : mine.status === "hidden" ? "hidden by the store" : "waiting for approval"}. Editing sends it for approval again.
        </p>
      ) : null}
      <fieldset>
        <legend className="text-sm font-medium text-ink-soft">Your rating</legend>
        <div className="mt-1 flex gap-1" onPointerLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className="cursor-pointer" onPointerEnter={() => setHover(i)}>
              <input type="radio" name={`${rg}-rating`} value={i} checked={rating === i} onChange={() => setRating(i)} className="peer sr-only" />
              <span className="sr-only">{i} star{i === 1 ? "" : "s"}</span>
              <Star
                className={cn("size-7 rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-leaf-500", i <= shown ? "text-[#e8a317]" : "text-sage-200")}
                fill="currentColor"
                strokeWidth={0}
                aria-hidden
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="review-comment" className="text-sm font-medium text-ink-soft">Comment (optional)</label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-lime-200/70"
          placeholder="How was the freshness and taste?"
        />
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">Thanks! Your review will appear after the store approves it.</Notice> : null}
      <Button type="submit" variant="dark" className="w-full" loading={busy}>{mine ? "Update review" : "Submit review"}</Button>
    </form>
  );
}
