import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Card } from "../components/ui/Card";

// Placeholder for Discover — a location-aware feed of riders, rides, and tours
// near the city on the rider's profile. No data wired yet; each section shows
// its empty state so the shape is clear for when Flow 2 fills it in.
export function DiscoverPage() {
  const { profile } = useAuth();
  // profile.city isn't on the base profiles row yet — read defensively.
  const city = (profile as { city?: string | null } | null)?.city?.trim() || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-h1)", lineHeight: "var(--lh-h1)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
          Discover
        </h1>
        <p style={{ margin: "var(--space-2xs) 0 0", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
          {city ? (
            <>
              Riders, rides and tours near{" "}
              <span style={{ color: "var(--color-text-primary)" }}>{city}</span>.
            </>
          ) : (
            <>
              Add your city in{" "}
              <Link to="/profile" style={{ color: "var(--color-accent)" }}>
                your profile
              </Link>{" "}
              to see who and what's nearby.
            </>
          )}
        </p>
      </header>

      <Section title="Riders near you" note="Nearby riders will appear here once profiles carry a city." />
      <Section title="Open rides" note="Public rides you can request to join will show up here." />
      <Section title="Tours" note="Curated multi-day tours and routes are coming soon." />
    </div>
  );
}

function Section({ title, note }: { title: string; note: ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number }}>
        {title}
      </h2>
      <Card>
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>{note}</p>
      </Card>
    </section>
  );
}
