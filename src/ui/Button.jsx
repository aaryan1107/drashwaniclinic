// Clinic button: Base UI Button for accessible behaviour, cva for the variant API.
// It renders the existing .primary-button / .secondary-button classes so every screen stays on one style.
import { Button as BaseButton } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";

export const buttonClass = cva("ui-button", {
  variants: {
    intent: {
      primary: "primary-button",
      secondary: "secondary-button",
      ghost: "ghost",
      danger: "secondary-button danger",
    },
    size: { md: "", sm: "size-sm" },
    block: { true: "block", false: "" },
  },
  defaultVariants: { intent: "primary", size: "md", block: false },
});

export function Button({ intent, size, block, loading = false, icon = null, className, children, disabled, type = "button", ...props }) {
  return (
    <BaseButton
      type={type}
      className={clsx(buttonClass({ intent, size, block }), className)}
      disabled={disabled || loading}
      focusableWhenDisabled={loading}
      aria-busy={loading || undefined}
      data-loading={loading ? "" : undefined}
      {...props}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </BaseButton>
  );
}
