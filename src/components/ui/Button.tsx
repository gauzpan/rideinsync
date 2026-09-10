import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

// Typed port of design/components/forms/Button.jsx — keep the two in sync.
type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: Variant;
  children?: ReactNode;
  loading?: boolean;
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
  fontSize: "var(--text-body-size)",
  fontWeight: "var(--weight-semibold)" as unknown as number,
  lineHeight: 1,
  transition: "background .15s ease, opacity .15s ease",
  outline: "none",
};

const variants: Record<Variant, CSSProperties> = {
  primary: { background: "var(--color-accent)", color: "var(--color-text-on-accent)" },
  secondary: {
    background: "var(--color-surface-2)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-divider)",
  },
  ghost: { background: "transparent", color: "var(--color-text-primary)" },
  danger: { background: "var(--color-danger)", color: "var(--color-text-on-danger)" },
};

export function Button({
  variant = "primary",
  children,
  disabled,
  loading,
  fullWidth = true,
  style,
  className,
  ...rest
}: Props) {
  const disabledStyle: CSSProperties | null = disabled
    ? { background: "var(--color-surface-3)", color: "var(--color-text-tertiary)", border: "none" }
    : null;
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={["btn", className].filter(Boolean).join(" ")}
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
      {loading ? "Loading…" : children}
    </button>
  );
}
