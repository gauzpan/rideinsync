import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { RiderPicker, type RiderHit } from "../components/RiderPicker";
import { useAuth } from "../hooks/useAuth";
import { createGroup } from "../services/groupsService";

// Multi-step group creation — one question per step so the form stays
// thumb-friendly: name → city → culture → tagline → rules → co-leads.
// The creator is always a lead; co-leads are optional riders picked by search.
const STEPS = ["name", "city", "culture", "tagline", "rules", "leads"] as const;
type StepKey = (typeof STEPS)[number];

const textareaStyle = {
  width: "100%",
  minHeight: 96,
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

export function CreateGroupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [culture, setCulture] = useState("");
  const [tagline, setTagline] = useState("");
  const [rules, setRules] = useState("");
  const [coLeads, setCoLeads] = useState<RiderHit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: StepKey = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // Only name and city gate progression; everything else is optional depth.
  const canContinue =
    (step !== "name" || name.trim().length > 0) &&
    (step !== "city" || city.trim().length > 0);

  async function handleSubmit() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const groupId = await createGroup({
        name, city, culture, tagline, rules,
        coLeads: coLeads.map((l) => l.id),
      });
      navigate(`/groups/${groupId}/invite`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the group.");
      setSubmitting(false);
    }
  }

  function next() {
    if (!canContinue) return;
    if (isLast) {
      void handleSubmit();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  return (
    <div>
      <BackLink to="/groups">Groups</BackLink>

      <header style={{ marginBottom: "var(--space-lg)" }}>
        <Eyebrow>
          Step {stepIndex + 1} of {STEPS.length}
        </Eyebrow>
        <Progress index={stepIndex} total={STEPS.length} />
        <h1 style={{ margin: "var(--space-sm) 0 0", fontSize: "var(--text-h1)", lineHeight: "var(--lh-h1)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
          {{ name: "Name your group",
             city: "Which city is it based in?",
             culture: "Describe the ride culture you want",
             tagline: "Give it a tagline",
             rules: "Set the group rules",
             leads: "Who leads the group?" }[step]}
        </h1>
      </header>

      <div style={{ marginBottom: "var(--space-lg)" }}>
        {step === "name" && (
          <Field hint="Shown on every ride this group plans.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday Scorchers" autoFocus />
          </Field>
        )}
        {step === "city" && (
          <Field hint="Helps riders near you find the group.">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bengaluru" autoFocus />
          </Field>
        )}
        {step === "culture" && (
          <Field hint="What's the vibe? Pace, skill level, how you ride together.">
            <textarea
              value={culture}
              onChange={(e) => setCulture(e.target.value)}
              placeholder="e.g. Relaxed pace, no-drop rides, coffee stops matter more than speed."
              style={textareaStyle}
              autoFocus
            />
          </Field>
        )}
        {step === "tagline" && (
          <Field hint="One line that sells the group.">
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Ride slow, laugh loud" autoFocus />
          </Field>
        )}
        {step === "rules" && (
          <Field hint="Helmet rules, formation, sweeps — what every member signs up for.">
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="e.g. Gear on every ride. Staggered formation. Sweep never gets passed."
              style={textareaStyle}
              autoFocus
            />
          </Field>
        )}
        {step === "leads" && (
          <Field hint="Leads can add or remove members. You're a lead automatically; add co-leads if you like.">
            <RiderPicker
              selected={coLeads}
              onSelect={(r) => setCoLeads((s) => [...s, r])}
              onRemove={(id) => setCoLeads((s) => s.filter((l) => l.id !== id))}
              excludeIds={user ? [user.id] : []}
              placeholder="Search riders to add as co-leads"
            />
          </Field>
        )}
        {error && (
          <p style={{ color: "var(--color-role-sweep)", fontSize: "var(--text-label)", margin: "var(--space-sm) 0 0" }}>
            {error}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        {stepIndex > 0 && (
          <Button variant="ghost" fullWidth={false} onClick={() => setStepIndex((i) => i - 1)}>
            Back
          </Button>
        )}
        <Button variant="primary" disabled={!canContinue} loading={submitting} onClick={next}>
          {isLast ? "Create group" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function Field({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <div>
      {children}
      {hint && (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)", margin: "var(--space-xs) 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-caption)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
      {children}
    </div>
  );
}

/** Segment bar for wizard progress — same treatment as HomePage's SetupMeter. */
function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 4, marginTop: "var(--space-xs)" }} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 20,
            borderRadius: "var(--radius-sm)",
            background: i <= index ? "var(--color-text-secondary)" : "var(--color-surface-4)",
          }}
        />
      ))}
    </div>
  );
}
