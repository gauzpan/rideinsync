import type { CSSProperties, ReactNode } from "react";

// Typed port of design/components/forms/SegmentedControl.jsx — keep the two in sync.
export type SegmentedOption =
  | string
  | {
      value: string;
      label: ReactNode;
      ariaLabel?: string;
    };

type Props = {
  options?: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  style?: CSSProperties;
};

export function SegmentedControl({ options = ["Low", "Medium", "High"], value, onChange, style }: Props) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        padding: 4,
        background: "var(--color-surface-3)",
        borderRadius: "var(--radius-full)",
        ...style,
      }}
    >
      {options.map((opt) => {
        const optValue = typeof opt === "string" ? opt : opt.value;
        const optLabel = typeof opt === "string" ? opt : opt.label;
        const optAriaLabel = typeof opt === "string" ? opt : opt.ariaLabel;
        const active = optValue === value;
        return (
          <button
            key={optValue}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={optAriaLabel}
            onClick={() => onChange?.(optValue)}
            style={{
              flex: 1,
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2xs)",
              border: "none",
              borderRadius: "var(--radius-full)",
              cursor: "pointer",
              background: active ? "var(--color-inverse-surface)" : "transparent",
              color: active ? "var(--color-text-on-inverse)" : "var(--color-text-secondary)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--text-label)",
              fontWeight: active ? ("var(--weight-semibold)" as unknown as number) : ("var(--weight-medium)" as unknown as number),
              transition: "background .15s ease",
            }}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}
