import type { CSSProperties, ReactNode } from "react";
import { IconButton } from "./IconButton";

// Typed port of design/components/forms/Stepper.jsx — keep the two in sync.
type Props = {
  value: number;
  /** override the shown label, e.g. "2 mi" or "2000 Steps / Trip" */
  display?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  style?: CSSProperties;
};

export function Stepper({ value, display, min, max, step = 1, onChange, style }: Props) {
  const atMin = min != null && value <= min;
  const atMax = max != null && value >= max;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-md)", ...style }}>
      <IconButton
        name="minus"
        variant="surface-4"
        disabled={atMin}
        style={atMin ? { opacity: 0.4 } : undefined}
        onClick={() => !atMin && onChange?.(value - step)}
      />
      <span
        style={{
          minWidth: 96,
          textAlign: "center",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-numeric)",
          fontVariantNumeric: "tabular-nums",
          fontSize: "var(--text-body-size)",
          fontWeight: "var(--weight-semibold)" as unknown as number,
        }}
      >
        {display != null ? display : value}
      </span>
      <IconButton
        name="plus"
        variant="surface-4"
        disabled={atMax}
        style={atMax ? { opacity: 0.4 } : undefined}
        onClick={() => !atMax && onChange?.(value + step)}
      />
    </div>
  );
}
