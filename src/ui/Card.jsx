// Settled card: flat surface, depth from a tinted "room" fill rather than borders or shadows.
// tone: plain | mint (care, next steps) | sage (highlight) | sky (information) | amber (waiting) | rose (alert).
// A tone is never the only signal: give the card an eyebrow or title that says what it is.
import { cva } from "class-variance-authority";
import { clsx } from "clsx";

export const cardClass = cva("ui-card", {
  variants: {
    tone: { plain: "", mint: "tone-mint", sage: "tone-sage", sky: "tone-sky", amber: "tone-amber", rose: "tone-rose" },
    pad: { md: "", lg: "pad-lg" },
  },
  defaultVariants: { tone: "plain", pad: "md" },
});

export function Card({ as: Tag = "section", tone, pad, eyebrow, className, children, ...props }) {
  return (
    <Tag className={clsx(cardClass({ tone, pad }), className)} {...props}>
      {eyebrow && <p className="clinic-eyebrow">{eyebrow}</p>}
      {children}
    </Tag>
  );
}
