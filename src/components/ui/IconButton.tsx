import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

// Typed port of design/components/forms/IconButton.jsx — keep the two in sync.
type Variant = "surface" | "surface-4" | "accent";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  name: IconName;
  /** diameter px, default 48 */
  size?: number;
  iconSize?: number;
  variant?: Variant;
};

export function IconButton({
  name,
  size = 48,
  iconSize = 22,
  variant = "surface",
  style,
  ...rest
}: Props) {
  const bg =
    variant === "accent"
      ? "var(--color-accent)"
      : variant === "surface-4"
        ? "var(--color-surface-4)"
        : "var(--color-surface-3)";
  const color = variant === "accent" ? "var(--color-text-on-accent)" : "var(--color-text-primary)";
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "var(--radius-full)",
    border: "none",
    background: bg,
    color,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background .15s ease",
  };
  return (
    <button type="button" aria-label={name} style={{ ...base, ...style }} {...rest}>
      <Icon name={name} size={iconSize} />
    </button>
  );
}
