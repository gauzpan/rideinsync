import { useState, type CSSProperties, type SelectHTMLAttributes } from "react";

export type SelectOption = {
  value: string;
  label: string;
};

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  value?: string;
  placeholder?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
};

export function Select({ value, placeholder, options, onChange, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const base: CSSProperties = {
    width: "100%",
    minHeight: "var(--control-height)",
    height: "var(--control-height)",
    padding: "0 var(--space-xl) 0 var(--space-md)",
    boxSizing: "border-box",
    background: "var(--color-surface-2)",
    border: `1px solid ${focused ? "var(--color-accent)" : "transparent"}`,
    borderRadius: "var(--radius-md)",
    color: value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-body-size)",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    cursor: "pointer",
    transition: "border-color .15s ease",
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ ...base, ...style }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      >
        {placeholder && (
          <option value="" style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
          >
            {opt.label}
          </option>
        ))}
      </select>
      <div
        style={{
          position: "absolute",
          right: "var(--space-md)",
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "var(--color-text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}