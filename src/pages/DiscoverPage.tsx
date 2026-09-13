import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Icon, type IconName } from "../components/ui/Icon";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { EDITOR_PICKS, PICK_CITIES, type EditorPick, type PickDifficulty, type PickMode } from "../data/editorPicks";

const CITY_LABELS = PICK_CITIES.map((c) => c.label);

const MODE_FILTERS: { label: string; mode: PickMode | null }[] = [
  { label: "All", mode: null },
  { label: "Bike", mode: "motorcycle" },
  { label: "Car", mode: "car" },
];
const MODE_FILTER_LABELS = MODE_FILTERS.map((f) => f.label);

const MODE_TAG_LABELS: Record<PickMode, string> = { motorcycle: "Bike", car: "Car" };

export function DiscoverPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
      <EditorPicksSection />
    </div>
  );
}

function EditorPicksSection() {
  const navigate = useNavigate();
  const [cityLabel, setCityLabel] = useState(CITY_LABELS[0]);
  const [modeFilterLabel, setModeFilterLabel] = useState(MODE_FILTER_LABELS[0]);

  const cityValue = PICK_CITIES.find((c) => c.label === cityLabel)?.value ?? PICK_CITIES[0].value;
  const modeFilter = MODE_FILTERS.find((f) => f.label === modeFilterLabel)?.mode ?? null;

  const picks = EDITOR_PICKS.filter(
    (p) => p.city === cityValue && (modeFilter === null || p.modes.includes(modeFilter)),
  );

  return (
    <section>
      <h2 style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number }}>
        Editor's Picks
      </h2>

      <SegmentedControl options={CITY_LABELS} value={cityLabel} onChange={setCityLabel} style={{ marginBottom: "var(--space-sm)" }} />
      <SegmentedControl options={MODE_FILTER_LABELS} value={modeFilterLabel} onChange={setModeFilterLabel} style={{ marginBottom: "var(--space-sm)" }} />

      {picks.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>
            No picks for this filter yet.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {picks.map((pick) => (
            <PickCard key={pick.id} pick={pick} cityLabel={cityLabel} onClick={() => navigate(`/discover/pick/${pick.id}`)} />
          ))}
        </div>
      )}
    </section>
  );
}

const DIFFICULTY_LABELS: Record<PickDifficulty, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

function PickCard({ pick, cityLabel, onClick }: { pick: EditorPick; cityLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ border: "none", background: "transparent", padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
    >
      <Card padding="0" style={{ overflow: "hidden" }}>
        <RouteVisual pickId={pick.id} />
        <div style={{ padding: "var(--space-md)" }}>
          <div style={{ fontSize: "var(--text-body-size)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
            {pick.name}
          </div>
          <div style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-2xs)" }}>
            Out of {cityLabel}
          </div>
          <div style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)", marginTop: "var(--space-2xs)" }}>
            {pick.distanceKm} km · {pick.bestSeason}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
            <MetaItem icon="clock">
              {pick.days} day{pick.days > 1 ? "s" : ""}
            </MetaItem>
            <MetaItem icon="flag">
              {pick.highlights.length} stop{pick.highlights.length > 1 ? "s" : ""}
            </MetaItem>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2xs)", marginTop: "var(--space-sm)" }}>
            {pick.difficulty && <Tag>{DIFFICULTY_LABELS[pick.difficulty]}</Tag>}
            {pick.modes.map((mode) => (
              <Tag key={mode}>{MODE_TAG_LABELS[mode]}</Tag>
            ))}
          </div>
        </div>
      </Card>
    </button>
  );
}

/** Deterministic "route texture" — a stylized zigzag line + endpoints over a
 *  faint grid, standing in for a real route thumbnail (no per-pick polyline
 *  data or map tiles in this static dataset). Varies per pick id so the list
 *  doesn't repeat one identical graphic. */
function RouteVisual({ pickId }: { pickId: string }) {
  let seed = 0;
  for (let i = 0; i < pickId.length; i++) seed = (seed * 31 + pickId.charCodeAt(i)) >>> 0;
  const jitter = (i: number, spread: number) => (((seed >> (i * 5)) & 31) / 31 - 0.5) * spread;

  const start: [number, number] = [28, 62 + jitter(0, 10)];
  const end: [number, number] = [272, 22 + jitter(1, 10)];
  const mid1: [number, number] = [110 + jitter(2, 20), 50 + jitter(3, 20)];
  const mid2: [number, number] = [190 + jitter(4, 20), 34 + jitter(5, 20)];
  const path = `M ${start[0]} ${start[1]} L ${mid1[0]} ${mid1[1]} L ${mid2[0]} ${mid2[1]} L ${end[0]} ${end[1]}`;

  return (
    <div
      style={{
        height: 96,
        background: "var(--color-surface-3)",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <svg viewBox="0 0 300 96" width="100%" height="100%" style={{ display: "block" }}>
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        <circle cx={start[0]} cy={start[1]} r={5} fill="var(--color-accent)" />
        <circle cx={end[0]} cy={end[1]} r={5} fill="var(--color-accent)" />
      </svg>
    </div>
  );
}

function MetaItem({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2xs)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
      <Icon name={icon} size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </span>
  );
}

function Tag({ children }: { children: ReactNode }) {
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
