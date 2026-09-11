import { useState, type CSSProperties, type InputHTMLAttributes } from "react";

// Typed port of design/components/forms/Input.jsx — keep the two in sync.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value?: string;
  placeholder?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export function Input({ value, placeholder, onChange, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const base: CSSProperties = {
    width: "100%",
    height: "var(--input-height)",
    padding: "0 var(--space-md)",
    boxSizing: "border-box",
    background: "var(--color-surface-2)",
    border: `1px solid ${focused ? "var(--color-accent)" : "transparent"}`,
    borderRadius: "var(--radius-md)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-body-size)",
    outline: "none",
    transition: "border-color .15s ease",
  };
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={onChange}
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
    />
  );
}
