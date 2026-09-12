// Google Places address autocomplete, styled to match the design-system Input.
// Uses Places API (New) over REST (CORS-enabled) so we don't need the Maps JS
// `places` widget here. On selection it returns the formatted address + exact
// lat/lng; free typing still passes through as a label with no coordinates.

import { useRef, useState } from "react";
import { Input } from "./Input";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export type PlaceValue = { label: string; lat?: number; lng?: number };

type Suggestion = { placeId: string; text: string };

export function PlaceInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: PlaceValue) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(false); // don't re-query right after a selection

  function handleType(text: string) {
    onChange({ label: text }); // free text → label only (coords cleared)
    if (debounce.current) clearTimeout(debounce.current);
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (!KEY || text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(() => void fetchSuggestions(text.trim()), 250);
  }

  async function fetchSuggestions(input: string) {
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
        body: JSON.stringify({ input, regionCode: "in" }),
      });
      const data = await r.json();
      const s: Suggestion[] = (data.suggestions ?? [])
        .filter((x: { placePrediction?: unknown }) => x.placePrediction)
        .map((x: { placePrediction: { placeId: string; text: { text: string } } }) => ({
          placeId: x.placePrediction.placeId,
          text: x.placePrediction.text.text,
        }));
      setSuggestions(s);
      setOpen(s.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    }
  }

  async function choose(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    skipNext.current = true;
    try {
      const r = await fetch(`https://places.googleapis.com/v1/places/${s.placeId}`, {
        headers: {
          "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": "location,formattedAddress,displayName",
        },
      });
      const d = await r.json();
      const label: string = d.formattedAddress ?? d.displayName?.text ?? s.text;
      onChange({ label, lat: d.location?.latitude, lng: d.location?.longitude });
    } catch {
      onChange({ label: s.text });
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(var(--input-height) + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "var(--color-surface-3)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep focus so onClick fires
              onClick={() => void choose(s)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "var(--space-sm) var(--space-md)",
                background: "none",
                border: "none",
                color: "var(--color-text-primary)",
                fontSize: "var(--text-body-size)",
                cursor: "pointer",
              }}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
