import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import {
  isDemoBackend,
  raiseAlertFrom,
  respondAs,
  reachAs,
  stayLatest,
  resolveLatest,
  SEED_USERS,
} from "../lib/sosDemo";

const linkStyle = {
  color: "var(--color-text-secondary)",
  fontSize: "var(--text-label)",
} as const;

const h1Style = {
  fontSize: "var(--text-h1)",
  lineHeight: "var(--lh-h1)",
  fontWeight: "var(--weight-semibold)",
  margin: "var(--space-sm) 0 var(--space-lg)",
} as const;

const noteStyle = { color: "var(--color-text-secondary)", margin: 0 } as const;

export function DemoControlsPage() {
  return (
    <div>
      <Link to="/" style={linkStyle}>
        ‹ Home
      </Link>
      <h1 style={h1Style}>Demo controls</h1>
      {isDemoBackend ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <p style={noteStyle}>Demo mode only. Simulates other riders in the demo ride.</p>
          <Button variant="secondary" onClick={() => raiseAlertFrom(SEED_USERS.KAVYA)}>
            Kavya raises an SOS
          </Button>
          <Button variant="secondary" onClick={() => respondAs(SEED_USERS.AARAV)}>
            Aarav is on the way
          </Button>
          <Button variant="secondary" onClick={() => reachAs(SEED_USERS.AARAV)}>
            Aarav has reached
          </Button>
          <Button variant="secondary" onClick={() => respondAs(SEED_USERS.MEERA)}>
            Meera is on the way
          </Button>
          <Button variant="secondary" onClick={() => reachAs(SEED_USERS.MEERA)}>
            Meera has reached
          </Button>
          <Button variant="secondary" onClick={() => stayLatest()}>
            Rider taps Stay (still needs help)
          </Button>
          <Button variant="secondary" onClick={() => resolveLatest()}>
            Resolve latest SOS
          </Button>
        </Card>
      ) : (
        <Card>
          <p style={noteStyle}>
            Available only in demo mode (VITE_DEMO_SESSION=1 without Supabase keys).
          </p>
        </Card>
      )}
    </div>
  );
}
