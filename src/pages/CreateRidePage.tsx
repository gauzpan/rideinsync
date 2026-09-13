import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { IconButton } from "../components/ui/IconButton";
import { Geolocation } from "@capacitor/geolocation";
import { Input } from "../components/ui/Input";
import { PlaceAutocomplete, type PlacePoint } from "../components/PlaceAutocomplete";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Stepper } from "../components/ui/Stepper";
import { useAuth } from "../hooks/useAuth";
import {
  createRide,
    updateRide,
  getRideDetail,
  parseJsonPoint,
  STOP_KINDS,
  STOP_LABELS,
  STOP_ICONS,
  type StopKind,
} from "../services/onboardingService";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const STOP_OPTIONS = STOP_KINDS.map((k) => ({
  value: k,
  label: (
    <>
      <Icon name={STOP_ICONS[k]} size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>{STOP_LABELS[k]}</span>
    </>
  ),
  ariaLabel: STOP_LABELS[k],
}));

let stopKey = 0;
type DraftStop = {
  key: number;
  kind: StopKind;
  point: PlacePoint | null;
};

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
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

function isoToDateTimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function DateTimeInput({
  value,
  onChange,
  ariaLabel,
  ariaRequired,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  ariaRequired?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={ariaLabel}
      aria-required={ariaRequired ? "true" : undefined}
      style={{
        width: "100%",
        minHeight: "var(--control-height)",
        height: "var(--control-height)",
        padding: "0 var(--space-md)",
        boxSizing: "border-box",
        background: "var(--color-surface-2)",
        border: `1px solid ${focused ? "var(--color-accent)" : "transparent"}`,
        borderRadius: "var(--radius-md)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--text-body-size)",
        colorScheme: "dark",
        outline: "none",
        transition: "border-color .15s ease",
      }}
    />
  );
}


export function CreateRidePage() {
  const { rideId } = useParams<{ rideId: string }>();
  const isEdit = Boolean(rideId);
  const { user, isGuest, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loadingRide, setLoadingRide] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
    const [departure, setDeparture] = useState("");
  const [expectedEnd, setExpectedEnd] = useState("");
  const [startPoint, setStartPoint] = useState<PlacePoint | null>(null);
  const [destination, setDestination] = useState<PlacePoint | null>(null);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [capacity, setCapacity] = useState(0); // 0 = no limit
  const [guidelines, setGuidelines] = useState("");
  const [permits, setPermits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  const [locating, setLocating] = useState(false);

  async function useCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      await Geolocation.requestPermissions();
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      setStartPoint({ label: "Current location", lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get your current location.");
    } finally {
      setLocating(false);
    }
  }
  // Dev builds skip the Google-only leader requirement entirely so every flow
  // is reachable without configuring OAuth locally (the requirement itself —
  // leading needs a durable, non-anonymous account — is a deliberate product
  // decision for production).
  const guestLeaderOverride = import.meta.env.DEV;
  // Shown only once someone who isn't eligible to lead (signed out entirely,
  // or signed in as an anonymous guest) actually tries to submit — the form
  // itself stays fully explorable either way, per product decision: only the
  // ride's sharing code (revealed after a successful create, on the invite
  // screen) needs to sit behind an account.
  const [showAccountGate, setShowAccountGate] = useState(false);
useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    setLoadingRide(true);
    setLoadError(null);

    getRideDetail(rideId)
      .then((detail) => {
        if (cancelled) return;
        if (!detail) {
          setLoadError("Ride not found.");
          return;
        }
        if (user && detail.ride.leader_id !== user.id) {
          setLoadError("Only the ride's leader can edit this ride.");
          return;
        }
        if (detail.ride.status !== "draft") {
          setLoadError("Only draft rides can be edited.");
          return;
        }

        setName(detail.ride.name);
        setDeparture(isoToDateTimeLocal(detail.ride.scheduled_start));
        setExpectedEnd(isoToDateTimeLocal(detail.ride.scheduled_end));
        setStartPoint(parseJsonPoint(detail.ride.start_point));
        setDestination(parseJsonPoint(detail.ride.destination));
        setStops(
          detail.stops.map((stop) => ({
            key: stopKey++,
            kind: (stop.kind as StopKind) || "fuel",
            point: parseJsonPoint(stop.location) ?? (stop.name ? { label: stop.name } : null),
          }))
        );
        setCapacity(detail.ride.member_capacity ?? 0);
        setGuidelines(detail.ride.guidelines ?? "");
        const permitNote =
          (detail.ride.permits as { note?: string } | null)?.note ??
          (typeof detail.ride.permits === "string" ? detail.ride.permits : "");
        setPermits(permitNote);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load ride.");
      })
      .finally(() => {
        if (!cancelled) setLoadingRide(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rideId, user]);

  function addStop() {
    setStops((s) => [...s, { key: stopKey++, kind: "fuel", point: null }]);   
  }
  function updateStop(key: number, patch: Partial<DraftStop>) {
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
    // Leading a ride needs a durable account: block here (at submit, not on
    // page load) so a signed-out visitor can still fill out and explore the
    // whole form — only the resulting sharing code needs an account.
    if (!isEdit && (!user || isGuest) && !guestLeaderOverride) {
      setShowAccountGate(true);
      return;
    }
    if (!user) {
      // Dev builds skip the Google gate above but still need *some* user id to
      // write the ride under — use the landing page's "Continue as developer
      // (dev)" button (see LandingPage.tsx) to get one.
      setError(
        import.meta.env.DEV
          ? 'Tap "Continue as developer (dev)" on the home screen first, then come back and try again.'
          : "Please sign in to continue.",
      );
      return;
    }
    setError(null);
    if (!name.trim() || !startPoint?.label.trim() || !destination?.label.trim()) {
      setError("Ride name, start point and destination are required.");
      return;
    }
        if (!departure) {
      setError("Departure date and time is required.");
      return;
    }
    const startDate = new Date(departure);
    if (isNaN(startDate.getTime())) {
      setError("Please enter a valid departure date and time.");
      return;
    }
    let startIso: string;
    try {
      startIso = startDate.toISOString();
    } catch {
      setError("Please enter a valid departure date and time.");
      return;
    }

    let endIso: string | null = null;
    if (expectedEnd) {
      const endDate = new Date(expectedEnd);
      if (isNaN(endDate.getTime())) {
        setError("Please enter a valid expected end date and time.");
        return;
      }
      if (endDate.getTime() <= startDate.getTime()) {
        setError("Expected end time must be after departure time.");
        return;
      }
      endIso = endDate.toISOString();
    }

    setSubmitting(true);
    try {
      const inputPayload = {
        name,
        scheduledStart: startIso,
        scheduledEnd: endIso,
        start: startPoint,
        destination: destination,
        stops: stops
          .filter((s) => s.point && s.point.label.trim().length > 0)
          .map(({ kind, point }) => ({
            kind,
            label: point!.label.trim(),
            lat: point!.lat,
            lng: point!.lng,
            placeId: point!.placeId,
            point,
          })),
        memberCapacity: capacity > 0 ? capacity : null,
        guidelines: guidelines || null,
        permits: permits || null
      };

      if (isEdit && rideId) {
        const updated = await updateRide(rideId, inputPayload, user.id);
        navigate(`/ride/${rideId}/invite`, { state: { ride: updated } });
      } else {
        const ride = await createRide(user.id, inputPayload);
        navigate(`/ride/${ride.id}/invite`, { state: { ride } });
      }
    } catch (e) {
          setError(
            e instanceof Error
            ? e.message: isEdit
            ? "Couldn't update the ride. Try again."
            : "Couldn't create the ride. Try again."
          );
       setSubmitting(false);

    //   const ride = await createRide(user.id, {
    //     name,
    //     startLabel,
    //     destinationLabel,
    //     startPoint,
    //     destinationPoint,
    //     stops: stops.map(({ label, kind, lat, lng }) => ({ label, kind, lat, lng })),
    //     memberCapacity: capacity > 0 ? capacity : null,
    //     guidelines: guidelines || null,
    //     permits: permits || null,
    //   });
    //   navigate(`/ride/${ride.id}/invite`, { state: { ride } });
    // } catch (e) {
    //   setError(e instanceof Error ? e.message : "Couldn't create the ride. Try again.");
    //   setSubmitting(false);
    // }
    }
  }

  const formBody = (
    <div>
      <p
        style={{
          fontSize: "var(--text-caption)",
          color: "var(--color-text-tertiary)",
          margin: "0 0 var(--space-md)",
        }}
      >
        * required
      </p>
      <Field label="Ride name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Coastal loop"
          aria-required="true"
        />
      </Field>
      <Field label="Departure" required hint="When riders will set off">
        <DateTimeInput
          value={departure}
          onChange={setDeparture}
          ariaLabel="Departure date and time"
          ariaRequired
        />
      </Field>
      <Field label="Expected end" hint="Optional approximate return or finish time">
        <DateTimeInput
          value={expectedEnd}
          onChange={setExpectedEnd}
          ariaLabel="Expected end date and time"
        />
      </Field>
      <PlaceAutocomplete
        label="Start point"
        required
        value={startPoint}
        onChange={setStartPoint}
        placeholder="e.g. City centre car park"
      />
      <button
        type="button"
        onClick={() => void useCurrentLocation()}
        disabled={locating}
        style={{
          margin: "calc(-1 * var(--space-sm)) 0 var(--space-md)",
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--color-accent)",
          fontSize: "var(--text-label)",
          fontWeight: "var(--weight-semibold)" as unknown as number,
          cursor: locating ? "default" : "pointer",
        }}
      >
        {locating ? "Getting your location…" : "◎ Use my current location"}
      </button>
      <PlaceAutocomplete
        label="Destination"
        required
        value={destination}
        onChange={setDestination}
        placeholder="e.g. Lighthouse point"
      />

      <SectionTitle>Route stops</SectionTitle>
      {stops.map((stop) => (
        <Card key={stop.key} padding="var(--space-md)" style={{ marginBottom: "var(--space-sm)" }}>
          <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <PlaceAutocomplete
                value={stop.point}
                onChange={(point) => updateStop(stop.key, { point })}
                placeholder="Stop name"
              />
            </div>
            <IconButton name="x" size={40} onClick={() => removeStop(stop.key)} />
          </div>
          <div style={{ marginTop: "var(--space-sm)" }}>
            <SegmentedControl
              options={STOP_OPTIONS}
              value={stop.kind}
              onChange={(kind) => updateStop(stop.key, { kind: kind as StopKind })}
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

      {error && (
        <p style={{ color: "var(--color-role-sweep)", marginBottom: "var(--space-md)" }}>
          {error}
        </p>
      )}

      {showAccountGate && (
        <Card padding="var(--space-lg)" style={{ marginBottom: "var(--space-md)" }}>
          <p style={{ margin: "0 0 var(--space-md)", color: "var(--color-text-secondary)" }}>
            Leading a ride needs a Google account, so riders are never following a ride owned by
            an account that could disappear. Joining stays open to guests.
          </p>
          <Button onClick={() => void handleGoogleUpgrade()} loading={googlePending}>
            Continue with Google
          </Button>
        </Card>
      )}

      <Button onClick={() => void handleSubmit()} loading={submitting}>
        {isEdit ? "Save changes" : "Create ride"}
      </Button>
    </div>
  );

  return (
    <div>
      <BackLink to={isEdit && rideId ? `/ride/${rideId}/invite` : "/ride"}>
        {isEdit ? "Back to invite" : "Rides"}
      </BackLink>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-lg)",
        }}
      >
        {isEdit ? "Edit ride" : "Create ride"}
      </h1>

      {loadingRide && (
        <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-md) 0" }}>
          Loading ride…
        </p>
      )}

      {loadError && (
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-md)" }}>
          <p style={{ color: "var(--color-role-sweep)", margin: 0 }}>{loadError}</p>
        </Card>
      )}

      {(!isEdit || (!loadingRide && !loadError)) &&
        (MAPS_KEY ? <APIProvider apiKey={MAPS_KEY}>{formBody}</APIProvider> : formBody)
      }
    </div>
  );
}
