import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import type { PlacePoint } from "../lib/models";

export type { PlacePoint };

export type PlaceAutocompleteProps = {
  value: PlacePoint | null;
  onChange: (point: PlacePoint | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  id?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
};

// Note: Google's autocomplete dropdown (.pac-container) keeps Google's default
// styling — acceptable for now; theming it is out of scope.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export function PlaceAutocomplete({
  value,
  onChange,
  label,
  placeholder,
  required,
  hint,
  id,
  style,
  inputStyle: customInputStyle,
}: PlaceAutocompleteProps) {
  const autoId = useId();
  const inputId = id ?? (label ? autoId : undefined);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // useMapsLibrary returns null if APIProvider is missing from the tree or still loading
  const placesLib = useMapsLibrary("places");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    // Graceful fallback: if MAPS_KEY is missing or the Places library fails
    // to load, skip attaching Google Autocomplete and allow normal text input.
    if (!MAPS_KEY || !placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "formatted_address", "place_id"],
      componentRestrictions: { country: "in" },
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place) return;

      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      const placeLabel =
        place.name || place.formatted_address || inputRef.current?.value || "";
      const placeId = place.place_id;

      if (typeof lat === "number" && typeof lng === "number") {
        onChangeRef.current({
          label: placeLabel,
          lat,
          lng,
          ...(placeId ? { placeId } : {}),
        });
      } else if (placeLabel.trim()) {
        onChangeRef.current({ label: placeLabel.trim() });
      } else {
        onChangeRef.current(null);
      }
    });

    return () => {
      // addListener can return undefined when the Places library is in a
      // degraded state (e.g. a misconfigured Maps key), so guard the cleanup.
      listener?.remove();
      if (typeof window !== "undefined" && window.google?.maps?.event) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [placesLib]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (text.length > 0) {
      onChange({ label: text });
    } else {
      onChange(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Prevent accidental form submission on Enter key
      e.preventDefault();
    }
  };

  const baseInputStyle: CSSProperties = {
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
    ...customInputStyle,
  };

  const content = (
    <>
      <input
        ref={inputRef}
        id={inputId}
        value={value?.label ?? ""}
        placeholder={placeholder}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        aria-required={required ? "true" : undefined}
        style={baseInputStyle}
      />
      {hint && (
        <p
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--color-text-tertiary)",
            margin: "var(--space-2xs) 0 0",
          }}
        >
          {hint}
        </p>
      )}
    </>
  );

  if (!label) {
    return <div style={{ width: "100%", ...style }}>{content}</div>;
  }

  return (
    <div style={{ marginBottom: "var(--space-md)", ...style }}>
      <label
        htmlFor={inputId}
        style={{
          display: "block",
          fontSize: "var(--text-label)",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-xs)",
        }}
      >
        {label}
        {required && (
          <span
            style={{
              color: "var(--color-role-sweep)",
              marginLeft: "var(--space-2xs)",
            }}
            aria-hidden="true"
          >
            *
          </span>
        )}
      </label>
      {content}
    </div>
  );
}