import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

// Typed port of design/components/surfaces/Card.jsx — keep the two in sync.
type Props = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  elevated?: boolean;
  glow?: boolean;
  padding?: string;
};

export function Card({
  children,
  elevated,
  glow,
  padding = "var(--space-md)",
  style,
  ...rest
}: Props) {
  const surface = elevated ? "var(--color-surface-1)" : "var(--color-surface-2)";
  const s: CSSProperties = {
    // grad-surface top-light layered over the existing surface colour.
    background: `var(--grad-surface), ${surface}`,
    borderRadius: "var(--radius-lg)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderTop: "1px solid rgba(255, 255, 255, 0.12)",
    padding,
    boxShadow: glow ? "var(--glow-accent), var(--shadow-raised)" : "var(--shadow-raised)",
    color: "var(--color-text-primary)",
    ...style,
  };
  return (
    <div style={s} {...rest}>
      {children}
    </div>
  );
}
