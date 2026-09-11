import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { QrScannerSheet } from "../components/QrScannerSheet";
import { useAuth } from "../hooks/useAuth";
import {
  extractJoinCode,
  getMinimumProfileStatus,
  getRidePreview,
  joinRideByCode,
  submitMinimumProfile,
  type MinimumProfileStatus,
  type RidePreview,
} from "../services/onboardingService";

type Step = "code" | "preview" | "profile";

function Field({ label, children }: { label: string; children: ReactNode }) {
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
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-md)",
        padding: "var(--space-sm) 0",
        borderBottom: "1px solid var(--color-divider)",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--color-text-primary)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function JoinRidePage() {
  const { code: codeParam } = useParams<{ code?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(codeParam ?? "");
  const [preview, setPreview] = useState<RidePreview | null>(null);
  const [profileStatus, setProfileStatus] = useState<MinimumProfileStatus | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  async function lookUpCode(value: string) {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getRidePreview(value);
      if (!result) {
        setError("That code doesn't match an active ride. Check it and try again.");
        return;
      }
      setPreview(result);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't look up that code.");
    } finally {
      setLoading(false);
    }
  }

  // A deep-link (`/join/:code`) lands here with the code pre-filled — look it
  // up immediately instead of waiting for a submit.
  useEffect(() => {
    if (codeParam) void lookUpCode(codeParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam]);

  async function handleContinueFromPreview() {
    if (!preview || !user) return;
    if (preview.alreadyMember) {
      navigate(`/ride/${preview.rideId}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await getMinimumProfileStatus(user.id);
      setProfileStatus(status);
      setDisplayName(status.displayName);
      setContactName(status.emergencyContactName);
      setContactPhone(status.emergencyContactPhone);
      setVehiclePlate(status.vehiclePlate);
      if (status.isComplete) {
        await completeJoin();
      } else {
        setStep("profile");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check your profile.");
    } finally {
      setLoading(false);
    }
  }

  async function completeJoin() {
    if (!preview || !user) return;
    const ride = await joinRideByCode(preview.code, user.id);
    navigate(`/ride/${ride.ride.id}`);
  }

  async function handleJoinFromProfile() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await submitMinimumProfile(user.id, {
        displayName,
        emergencyContactName: contactName,
        emergencyContactPhone: contactPhone,
        vehiclePlate,
      });
      await completeJoin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the ride. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const profileIncomplete = !displayName.trim() || !contactName.trim() || !contactPhone.trim() || !vehiclePlate.trim();

  function handleScanned(text: string) {
    setScannerOpen(false);
    const scannedCode = extractJoinCode(text);
    if (!scannedCode) {
      setError("That QR code doesn't look like a RideInSync invite.");
      return;
    }
    setError(null);
    setCode(scannedCode);
    void lookUpCode(scannedCode);
  }

  return (
    <div>
      <Link
        to="/"
        onClick={(e) => {
          if (step === "profile") {
            e.preventDefault();
            setStep("preview");
          } else if (step === "preview") {
            e.preventDefault();
            setStep("code");
            setPreview(null);
          }
        }}
        style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}
      >
        ‹ {step === "code" ? "Home" : "Back"}
      </Link>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-lg)",
        }}
      >
        Join ride
      </h1>

      {step === "code" && (
        <div>
          <Field label="Join code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. DEMO01"
              autoCapitalize="characters"
            />
          </Field>
          {error && (
            <p style={{ color: "var(--color-role-sweep)", marginBottom: "var(--space-md)" }}>{error}</p>
          )}
          <Button onClick={() => void lookUpCode(code)} loading={loading} disabled={!code.trim()}>
            Find ride
          </Button>
          <Button
            variant="secondary"
            style={{ marginTop: "var(--space-sm)" }}
            onClick={() => setScannerOpen(true)}
          >
            Scan QR to join
          </Button>
        </div>
      )}

      {scannerOpen && <QrScannerSheet onDecode={handleScanned} onClose={() => setScannerOpen(false)} />}

      {step === "preview" && preview && (
        <div>
          <Card padding="var(--space-lg)">
            <h2
              style={{
                fontSize: "var(--text-h2)",
                lineHeight: "var(--lh-h2)",
                fontWeight: "var(--weight-semibold)",
                margin: "0 0 var(--space-md)",
              }}
            >
              {preview.name}
            </h2>
            <SummaryRow label="Lead" value={preview.leaderName ?? "Unknown"} />
            <SummaryRow
              label="Route"
              value={`${preview.startLabel ?? "—"} → ${preview.destinationLabel ?? "—"}`}
            />
            {preview.stopLabels.length > 0 && (
              <SummaryRow label="Stops" value={preview.stopLabels.join(", ")} />
            )}
            <SummaryRow label="Status" value={preview.status === "draft" ? "Not started yet" : "Active"} />
            <SummaryRow
              label="Capacity"
              value={
                preview.memberCapacity
                  ? `${preview.memberCount} / ${preview.memberCapacity} riders`
                  : `${preview.memberCount} riders`
              }
            />
            {preview.guidelines && <SummaryRow label="Guidelines" value={preview.guidelines} />}
          </Card>

          {preview.alreadyMember && (
            <p style={{ color: "var(--color-text-secondary)", margin: "var(--space-md) 0" }}>
              You're already in this ride.
            </p>
          )}

          {error && (
            <p style={{ color: "var(--color-role-sweep)", margin: "var(--space-md) 0 0" }}>{error}</p>
          )}
          <Button
            style={{ marginTop: "var(--space-lg)" }}
            onClick={() => void handleContinueFromPreview()}
            loading={loading}
          >
            {preview.alreadyMember ? "Go to ride" : "Continue"}
          </Button>
        </div>
      )}

      {step === "profile" && (
        <div>
          <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-lg)" }}>
            Before you join, the group needs a name, an emergency contact and your vehicle's
            registration number.
          </p>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Emergency contact name">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Who to call"
            />
          </Field>
          <Field label="Emergency contact phone">
            <Input
              type="tel"
              inputMode="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Phone number"
            />
          </Field>
          <Field label="Vehicle registration number">
            <Input
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
              placeholder="e.g. KA01AB1234"
              autoCapitalize="characters"
            />
          </Field>

          {profileIncomplete && (
            <p style={{ color: "var(--color-text-tertiary)", margin: "0 0 var(--space-md)", fontSize: "var(--text-caption)" }}>
              These details keep the group safe if something goes wrong — you can still join without
              them for now and finish your profile later.
            </p>
          )}
          {profileStatus && (profileStatus.hasEmergencyContact || profileStatus.hasVehicle) && (
            <p style={{ color: "var(--color-text-tertiary)", margin: "0 0 var(--space-md)", fontSize: "var(--text-caption)" }}>
              We reused details already on file for you.
            </p>
          )}
          {error && (
            <p style={{ color: "var(--color-role-sweep)", marginBottom: "var(--space-md)" }}>{error}</p>
          )}
          <Button onClick={() => void handleJoinFromProfile()} loading={loading}>
            {profileIncomplete ? "Join anyway" : "Join ride"}
          </Button>
        </div>
      )}
    </div>
  );
}
