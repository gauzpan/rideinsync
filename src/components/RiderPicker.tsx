import { useEffect, useState } from "react";
import { Input } from "./ui/Input";
import { Icon } from "./ui/Icon";
import { searchRiders } from "../services/groupsService";

export type RiderHit = { id: string; display_name: string };

type Props = {
  /** Riders already picked this session — shown as removable chips. */
  selected: RiderHit[];
  onSelect: (rider: RiderHit) => void;
  onRemove: (id: string) => void;
  /** Ids to hide from results (e.g. current members, the creator). */
  excludeIds?: string[];
  placeholder?: string;
};

/** Search-as-you-type rider picker backed by the search_riders RPC — used by
 *  the group-creation wizard (co-leads) and the group detail page (members).
 *  Results render under the input; picked riders render as removable chips. */
export function RiderPicker({ selected, onSelect, onRemove, excludeIds = [], placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RiderHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced search; clears when the query is too short to be meaningful.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchRiders(query.trim())
        .then((rows) => setHits(rows.filter((r) => !excludeIds.includes(r.id))))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, excludeIds]);

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? "Search riders by name"}
        aria-label="Search riders by name"
      />
      {searching && query.trim().length >= 2 && (
        <p style={{ margin: "var(--space-2xs) 0 0", fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)" }}>
          Searching…
        </p>
      )}
      {hits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xs)", marginTop: "var(--space-xs)" }}>
          {hits.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect(r);
                setQuery("");
                setHits([]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-sm)",
                minHeight: 44,
                padding: "var(--space-xs) var(--space-sm)",
                border: "1px solid var(--color-divider)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-surface-2)",
                color: "var(--color-text-primary)",
                fontSize: "var(--text-body-size)",
                cursor: "pointer",
              }}
            >
              <span>{r.display_name}</span>
              <Icon name="plus" size={16} />
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)", marginTop: "var(--space-sm)" }}>
          {selected.map((r) => (
            <span
              key={r.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2xs)",
                height: 32,
                padding: "0 var(--space-xs) 0 var(--space-sm)",
                borderRadius: "var(--radius-full)",
                background: "var(--color-surface-3)",
                fontSize: "var(--text-label)",
                color: "var(--color-text-primary)",
              }}
            >
              {r.display_name}
              <button
                type="button"
                aria-label={`Remove ${r.display_name}`}
                onClick={() => onRemove(r.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  border: "none",
                  borderRadius: "var(--radius-full)",
                  background: "transparent",
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
