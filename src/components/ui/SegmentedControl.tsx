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
        // Options may be plain strings or { value, label, ariaLabel } objects —
        // normalize so the render/selection logic is uniform.
        const o = typeof opt === "string" ? { value: opt, label: opt as ReactNode, ariaLabel: undefined } : opt;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange?.(o.value)}
            style={{
              flex: 1,
              height: 40,
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
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
