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
    // Bumped into the 0.10-0.14 range (docs/plan-update-visual.md §5) so the
    // card edge reads as a deliberate hairline rather than barely-there.
    border: "1px solid rgba(255, 255, 255, 0.10)",
    borderTop: "1px solid rgba(255, 255, 255, 0.14)",
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
