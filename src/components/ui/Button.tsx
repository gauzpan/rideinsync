import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Loader } from "./Loader";
import { SuccessCheck } from "./SuccessCheck";

// Typed port of design/components/forms/Button.jsx — keep the two in sync.
type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: Variant;
  children?: ReactNode;
  loading?: boolean;
  /** Briefly swaps the label for a success check — the caller clears this
   *  again (~1s) once the confirmation has had its moment. */
  success?: boolean;
  fullWidth?: boolean;
};

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-xs)",
  height: "var(--control-height)",
  padding: "0 var(--space-lg)",
  border: "none",
  borderRadius: "var(--radius-full)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--text-button)",
  fontWeight: "var(--weight-semibold)" as unknown as number,
  lineHeight: 1,
  transition: "background .15s ease, opacity .15s ease",
  outline: "none",
};

const variants: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--grad-accent)",
    color: "var(--color-text-on-accent)",
    boxShadow: "var(--shadow-raised-accent)",
  },
  // Deliberately quieter than primary (docs/plan-update-visual.md §4 — "do not
  // make both buttons look equally important"): a shorter, flat, translucent
  // dark surface instead of the primary's raised key-cap depth, so "Create a
  // ride" reads as the one dominant action on screen.
  secondary: {
    height: "52px",
    background: "rgba(255, 255, 255, 0.06)",
    color: "var(--color-text-primary)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    boxShadow: "none",
  },
  ghost: { background: "transparent", color: "var(--color-text-primary)" },
  danger: {
    background: "var(--grad-danger)",
    color: "var(--color-text-on-danger)",
    boxShadow: "var(--shadow-raised-danger)",
  },
};

export function Button({
  variant = "primary",
  children,
  disabled,
  loading,
  success,
  fullWidth = true,
  style,
  className,
  ...rest
}: Props) {
  const disabledStyle: CSSProperties | null = disabled
    ? {
        background: "var(--color-surface-3)",
        color: "var(--color-text-disabled)",
        border: "none",
        boxShadow: "none", // disabled reads flat — no raised depth
      }
    : null;
  // Only the key-cap-depth variants (primary/danger) get the press-in class —
  // secondary is deliberately flat/quiet (see its style above), and ghost/
  // disabled were already excluded.
  const raised = !disabled && (variant === "primary" || variant === "danger");
  return (
    <button
      type="button"
      disabled={disabled || loading || success}
      className={["btn", raised && "ui-raised", className].filter(Boolean).join(" ")}
      style={{
        ...base,
        width: fullWidth ? "100%" : "auto",
        cursor: disabled ? "not-allowed" : "pointer",
        ...variants[variant],
        ...disabledStyle,
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader size={20} label="Loading" /> : success ? <SuccessCheck size={20} /> : children}
    </button>
  );
}
