import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EDITOR_PICKS, PICK_CITIES, type PickMode } from "../data/editorPicks";

const MODE_TAG_LABELS: Record<PickMode, string> = { motorcycle: "Bike", car: "Car" };
const DIFFICULTY_LABELS: Record<string, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

export function PickDetailPage() {
  const { pickId } = useParams<{ pickId: string }>();
  const navigate = useNavigate();
  const pick = EDITOR_PICKS.find((p) => p.id === pickId);

  if (!pick) {
    return (
      <div>
        <BackLink to="/discover">Discover</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>Pick not found.</p>
        </Card>
      </div>
    );
  }

  const cityLabel = PICK_CITIES.find((c) => c.value === pick.city)?.label ?? pick.city;

  return (
    <div>
      <BackLink to="/discover">Discover</BackLink>

      <h1 style={{ margin: "var(--space-sm) 0 var(--space-2xs)", fontSize: "var(--text-h1)", lineHeight: "var(--lh-h1)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
        {pick.name}
      </h1>
      <p style={{ margin: "0 0 var(--space-md)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
        Out of {cityLabel}
      </p>

      <div style={{ display: "flex", gap: "var(--space-2xs)", marginBottom: "var(--space-md)" }}>
        {pick.modes.map((mode) => (
          <ModeTag key={mode}>{MODE_TAG_LABELS[mode]}</ModeTag>
        ))}
      </div>

      <Card padding="var(--space-md)" style={{ marginBottom: "var(--space-md)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-lg)" }}>
          <Stat label="Distance" value={`${pick.distanceKm} km`} />
          <Stat label="Duration" value={`${pick.days} day${pick.days > 1 ? "s" : ""}`} />
          <Stat label="Best season" value={pick.bestSeason} />
          {pick.difficulty && <Stat label="Difficulty" value={DIFFICULTY_LABELS[pick.difficulty] ?? pick.difficulty} />}
        </div>
      </Card>

      <p style={{ margin: "0 0 var(--space-md)", fontSize: "var(--text-body-size)", color: "var(--color-text-primary)" }}>
        {pick.blurb}
      </p>

      <h2 style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number }}>
        Highlights
      </h2>
      <Card padding="var(--space-md)" style={{ marginBottom: "var(--space-lg)" }}>
        <ul style={{ margin: 0, paddingLeft: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-2xs)" }}>
          {pick.highlights.map((h) => (
            <li key={h} style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
              {h}
            </li>
          ))}
        </ul>
      </Card>

      <Button variant="primary" fullWidth onClick={() => navigate("/create")}>
        Plan a ride
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-caption)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-medium)" as unknown as number }}>{value}</div>
    </div>
  );
}

function ModeTag({ children }: { children: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 var(--space-xs)",
        borderRadius: "var(--radius-full)",
        background: "var(--color-surface-3)",
        color: "var(--color-text-secondary)",
        fontSize: "var(--text-caption)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
