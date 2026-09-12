import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { Input } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Stepper } from "../components/ui/Stepper";
import { useAuth } from "../hooks/useAuth";
import {
  createRide,
  STOP_KINDS,
  type CreateRideStopInput,
  type StopKind,
} from "../services/onboardingService";

const STOP_LABELS: Record<StopKind, string> = {
  fuel: "Fuel",
  food: "Food",
  rest: "Rest",
  scenic: "Scenic",
};

let stopKey = 0;
type DraftStop = CreateRideStopInput & { key: number };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--space-md)" }}>
      <label
        style={{
          display: "block",
          fontSize: "var(--text-label)",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-xs)",
        }}
      >
        {label}
      </label>
      {children}
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
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--text-h2)",
        lineHeight: "var(--lh-h2)",
        fontWeight: "var(--weight-semibold)",
        margin: "var(--space-xl) 0 var(--space-md)",
      }}
    >
      {children}
    </h2>
  );
}

const textareaStyle = {
  width: "100%",
  minHeight: 88,
  padding: "var(--space-sm) var(--space-md)",
  boxSizing: "border-box" as const,
  background: "var(--color-surface-2)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--text-body-size)",
  resize: "vertical" as const,
  outline: "none",
};

export function CreateRidePage() {
  const { user, isGuest, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [startLabel, setStartLabel] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [capacity, setCapacity] = useState(0); // 0 = no limit
  const [guidelines, setGuidelines] = useState("");
  const [permits, setPermits] = useState("");
  const [fee, setFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  // Dev-only fallback: let a guest lead a ride so the form→tracker path is
  // demoable before Google OAuth is configured. Coordinate with Mithul before
  // this reaches main (the Google-only rule is a deliberate product decision).
  const [guestLeaderOverride, setGuestLeaderOverride] = useState(false);
  const showForm = !isGuest || guestLeaderOverride;

  function addStop() {
    setStops((s) => [...s, { key: stopKey++, label: "", kind: "fuel" }]);
  }
  function updateStop(key: number, patch: Partial<CreateRideStopInput>) {
    setStops((s) => s.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)));
  }
  function removeStop(key: number) {
    setStops((s) => s.filter((stop) => stop.key !== key));
  }

  async function handleGoogleUpgrade() {
    setGooglePending(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setGooglePending(false);
      setError(e instanceof Error ? e.message : "Couldn't start Google sign-in.");
    }
  }

  async function handleSubmit() {
    if (!user) return;
    setError(null);
    if (!name.trim() || !startLabel.trim() || !destinationLabel.trim()) {
      setError("Ride name, start point and destination are required.");
      return;
    }
    setSubmitting(true);
    try {
      const ride = await createRide(user.id, {
        name,
        startLabel,
        destinationLabel,
        stops: stops.map(({ label, kind }) => ({ label, kind })),
        memberCapacity: capacity > 0 ? capacity : null,
        guidelines: guidelines || null,
        permits: permits || null,
        feeAmount: fee.trim() ? Number(fee) : null,
      });
      navigate(`/ride/${ride.id}/invite`, { state: { ride } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the ride. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link to="/" style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>
        ‹ Home
      </Link>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-lg)",
        }}
      >
        Create ride
      </h1>

      {!showForm && (
        <Card padding="var(--space-lg)">
          <p style={{ margin: "0 0 var(--space-md)", color: "var(--color-text-secondary)" }}>
            Leading a ride needs a Google account, so riders are never following a ride owned by
            an account that could disappear. Joining stays open to guests.
          </p>
          <Button onClick={() => void handleGoogleUpgrade()} loading={googlePending}>
            Continue with Google
          </Button>
          {error && (
            <p style={{ color: "var(--color-role-sweep)", marginTop: "var(--space-sm)" }}>
              {error}
            </p>
          )}
          {/* Dev fallback — bypasses the Google-only rule for testing without OAuth.
              Also the only viable leader path inside the WebView, since Google
              blocks OAuth in embedded WebViews. */}
          <Button
            variant="secondary"
            onClick={() => setGuestLeaderOverride(true)}
            style={{ marginTop: "var(--space-sm)" }}
          >
            Create as guest (dev)
          </Button>
        </Card>
      )}

      {showForm && (
        <div>
          <Field label="Ride name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal loop" />
          </Field>
          <Field label="Start point">
            <Input
              value={startLabel}
              onChange={(e) => setStartLabel(e.target.value)}
              placeholder="e.g. City centre car park"
            />
          </Field>
          <Field label="Destination">
            <Input
              value={destinationLabel}
              onChange={(e) => setDestinationLabel(e.target.value)}
              placeholder="e.g. Lighthouse point"
            />
          </Field>

          <SectionTitle>Route stops</SectionTitle>
          {stops.map((stop) => (
            <Card key={stop.key} padding="var(--space-md)" style={{ marginBottom: "var(--space-sm)" }}>
              <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    value={stop.label}
                    onChange={(e) => updateStop(stop.key, { label: e.target.value })}
                    placeholder="Stop name"
                  />
                </div>
                <IconButton name="x" size={40} onClick={() => removeStop(stop.key)} />
              </div>
              <div style={{ marginTop: "var(--space-sm)" }}>
                <SegmentedControl
                  options={STOP_KINDS.map((k) => STOP_LABELS[k])}
                  value={STOP_LABELS[stop.kind]}
                  onChange={(label) => {
                    const kind = STOP_KINDS.find((k) => STOP_LABELS[k] === label) ?? "fuel";
                    updateStop(stop.key, { kind });
                  }}
                />
              </div>
            </Card>
          ))}
          <Button variant="secondary" onClick={addStop} style={{ marginBottom: "var(--space-md)" }}>
            + Add stop
          </Button>

          <SectionTitle>Optional details</SectionTitle>
          <Field label="Expected capacity" hint="0 = no limit">
            <Stepper
              value={capacity}
              min={0}
              max={50}
              display={capacity === 0 ? "No limit" : `${capacity} riders`}
              onChange={setCapacity}
            />
          </Field>
          <Field label="Guidelines">
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="Helmets on, no overtaking the lead, regroup at every stop…"
              style={textareaStyle}
            />
          </Field>
          <Field label="Permits">
            <Input
              value={permits}
              onChange={(e) => setPermits(e.target.value)}
              placeholder="e.g. Forest entry permit required"
            />
          </Field>
          <Field label="Fee">
            <Input
              type="number"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          {error && (
            <p style={{ color: "var(--color-role-sweep)", marginBottom: "var(--space-md)" }}>
              {error}
            </p>
          )}
          <Button onClick={() => void handleSubmit()} loading={submitting}>
            Create ride
          </Button>
        </div>
      )}
    </div>
  );
}
