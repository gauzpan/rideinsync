import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { QrScannerSheet } from "../components/QrScannerSheet";
import { useAuth } from "../hooks/useAuth";
import {
  extractJoinCode,
  formatScheduleDateTime,
  getEligibleRidersForPillion,
  getJoinRequestStatus,
  getMinimumProfileStatus,
  getRidePreview,
  grantConsent,
  joinRideByCode,
  linkPillionToRider,
  submitMinimumProfile,
  withdrawJoinRequest,
  type MinimumProfileStatus,
  type PillionRiderOption,
  type RidePreview,
} from "../services/onboardingService";

type Step = "code" | "preview" | "mode" | "profile" | "linkRider" | "pending";
type JoinMode = "own" | "pillion";

const MODE_OPTIONS = ["Riding my own bike", "Riding pillion"] as const;

const STATUS_POLL_MS = 5000;

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
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
      {error && (
        <p
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--color-role-sweep)",
            margin: "var(--space-2xs) 0 0",
          }}
        >
          {error}
        </p>
      )}
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
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(codeParam ?? "");
  const [preview, setPreview] = useState<RidePreview | null>(null);
  const [profileStatus, setProfileStatus] = useState<MinimumProfileStatus | null>(null);
  const [mode, setMode] = useState<JoinMode>("own");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Pillion linking (ticket 06) — populated once the pillion has become a
  // ride member and can read the roster under RLS.
  const [joinedRideId, setJoinedRideId] = useState<string | null>(null);
  const [eligibleRiders, setEligibleRiders] = useState<PillionRiderOption[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Non-demo join: request_join_ride leaves the rider pending until the lead
  // approves/declines (ticket 05). Track the outcome here instead of
  // navigating to ride detail, which RLS would block for a non-member.
  const [pendingRideId, setPendingRideId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<"pending" | "approved" | "rejected">("pending");

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

  // Ride full (ticket 07): a client-side capacity guard — the join RPCs live
  // in the shared foundation and aren't altered here (see
  // docs/flow1-onboarding-spec.md). Doesn't apply to a member re-entering.
  const isRideFull =
    !!preview &&
    !preview.alreadyMember &&
    !!preview.memberCapacity &&
    preview.memberCount >= preview.memberCapacity;

  // Own-bike vs pillion branch (ticket 06): pick the join path's shape before
  // asking for any profile fields, so a pillion never sees the vehicle field.
  function handleContinueFromPreview() {
    if (!preview) return;
    if (preview.status === "cancelled") {
      setError("This ride was cancelled by the leader.");
      return;
    }
    if (preview.alreadyMember) {
      navigate(`/ride/${preview.rideId}`);
      return;
    }
    if (isRideFull) {
      setError("This ride is full. Ask the lead to raise the capacity, or try another ride.");
      return;
    }
    setError(null);
    setStep("mode");
  }

  async function handleContinueFromMode() {
    if (!preview || !user) return;
    setLoading(true);
    setError(null);
    try {
      const status = await getMinimumProfileStatus(user.id);
      setProfileStatus(status);
      setFirstName(status.firstName);
      setLastName(status.lastName);
      setContactName(status.emergencyContactName);
      setContactPhone(status.emergencyContactPhone);
      setVehiclePlate(status.vehiclePlate);
      setConsentChecked(status.hasConsent);
      const complete =
        mode === "pillion"
          ? !!status.firstName && status.hasEmergencyContact && status.hasConsent
          : status.isComplete;
      if (complete) {
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

  async function loadEligibleRiders(rideId: string) {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const riders = await getEligibleRidersForPillion(rideId, user.id);
      setEligibleRiders(riders);
      setSelectedRiderId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the roster.");
    } finally {
      setLoading(false);
    }
  }

  async function completeJoin() {
    if (!preview || !user) return;
    const joined = await joinRideByCode(preview.code, user.id);
    if (joined.member) {
      // Demo ride (or already-approved): membership materialised immediately.
      if (mode === "pillion") {
        // Now a ride member, so the roster is readable under RLS — move to
        // picking which rider's bike they're on.
        setJoinedRideId(joined.rideId);
        await loadEligibleRiders(joined.rideId);
        setStep("linkRider");
        return;
      }
      navigate(`/ride/${joined.rideId}`);
      return;
    }
    // Non-demo ride: a `ride_join_requests` row was created, pending the
    // lead's approval — wait here rather than navigating to a ride-detail
    // fetch that RLS would block for a non-member. (A pillion whose join is
    // pending links their rider once approved, from ride detail.)
    setPendingRideId(joined.rideId);
    setRequestStatus("pending");
    setStep("pending");
  }

  async function handleConfirmLink() {
    if (!joinedRideId || !user || !selectedRiderId) return;
    setLoading(true);
    setError(null);
    try {
      await linkPillionToRider(joinedRideId, user.id, selectedRiderId);
      navigate(`/ride/${joinedRideId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link to that rider. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Poll the rider's own join-request status while waiting, so an approval
  // or decline (ticket 05) is reflected here without a manual refresh.
  useEffect(() => {
    if (step !== "pending" || !pendingRideId || !user) return;
    let cancelled = false;

    async function poll() {
      try {
        const status = await getJoinRequestStatus(pendingRideId!, user!.id);
        if (cancelled || !status) return;
        if (status === "approved") {
          navigate(`/ride/${pendingRideId}`);
        } else if (status === "rejected") {
          setRequestStatus("rejected");
        }
      } catch {
        // Transient network/RLS hiccup — the interval retries; no need to
        // surface an error for a background poll.
      }
    }

    void poll();
    const id = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pendingRideId, user?.id]);

  async function handleJoinFromProfile() {
    if (!user || !consentChecked) return;
    setLoading(true);
    setError(null);
    try {
      // Consent is the one hard gate here (unlike name/contact/vehicle,
      // which stay skippable for the demo) — a single checkbox covers both
      // policies this build tracks (docs/flow1-onboarding-spec.md).
      await grantConsent(user.id);
      await submitMinimumProfile(user.id, {
        firstName,
        lastName: lastName.trim() || undefined,
        emergencyContactName: contactName,
        emergencyContactPhone: contactPhone,
        // Pillions have no vehicle — the minimum profile is name + one
        // emergency contact only (docs/flow1-onboarding-spec.md).
        vehiclePlate: mode === "pillion" ? "" : vehiclePlate,
      });
      await refreshProfile();
      await completeJoin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the ride. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const profileIncomplete =
    mode === "pillion"
      ? !firstName.trim() || !contactName.trim() || !contactPhone.trim()
      : !firstName.trim() || !contactName.trim() || !contactPhone.trim() || !vehiclePlate.trim();

  async function handleWithdraw() {
    if (!pendingRideId || !user) return;
    setWithdrawing(true);
    setError(null);
    try {
      await withdrawJoinRequest(pendingRideId, user.id);
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't withdraw the request. Try again.");
    } finally {
      setWithdrawing(false);
    }
  }

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
          if (step === "linkRider") {
            e.preventDefault();
            setStep("profile");
          } else if (step === "profile") {
            e.preventDefault();
            setStep("mode");
          } else if (step === "mode") {
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
        ‹ {step === "code" || step === "pending" ? "Home" : "Back"}
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
        preview.status === "cancelled" ? (
          <div>
            <Card padding="var(--space-lg)">
              <h2
                style={{
                  fontSize: "var(--text-h2)",
                  lineHeight: "var(--lh-h2)",
                  fontWeight: "var(--weight-semibold)",
                  margin: "0 0 var(--space-xs)",
                }}
              >
                {preview.name}
              </h2>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                This ride was cancelled by the leader.
              </p>
            </Card>
            <div style={{ marginTop: "var(--space-lg)" }}>
              <Link
                to="/"
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--text-label)",
                  textDecoration: "underline",
                  display: "inline-block",
                  minHeight: 56,
                  lineHeight: "56px",
                }}
              >
                ‹ Home
              </Link>
            </div>
          </div>
        ) : (
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
              {preview.scheduledStart && (
                <SummaryRow
                  label="Departure"
                  value={formatScheduleDateTime(preview.scheduledStart)}
                />
              )}
              {preview.scheduledEnd && (
                <SummaryRow
                  label="Expected end"
                  value={formatScheduleDateTime(preview.scheduledEnd)}
                />
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
              onClick={handleContinueFromPreview}
              loading={loading}
            >
              {preview.alreadyMember ? "Go to ride" : "Continue"}
            </Button>
          </div>
        )
      )}

      {step === "mode" && preview && (
        <div>
          <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-lg)" }}>
            Are you riding your own bike, or riding pillion with someone else in "{preview.name}"?
          </p>
          <SegmentedControl
            options={[...MODE_OPTIONS]}
            value={mode === "pillion" ? "Riding pillion" : "Riding my own bike"}
            onChange={(v) => setMode(v === "Riding pillion" ? "pillion" : "own")}
          />
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)", margin: "var(--space-md) 0 0" }}>
            {mode === "pillion"
              ? "You'll record your own name and emergency contact, then pick which rider's bike you're on. No vehicle needed."
              : "You'll record your name, an emergency contact and your vehicle's registration number."}
          </p>
          {error && (
            <p style={{ color: "var(--color-role-sweep)", margin: "var(--space-md) 0 0" }}>{error}</p>
          )}
          <Button style={{ marginTop: "var(--space-lg)" }} onClick={() => void handleContinueFromMode()} loading={loading}>
            Continue
          </Button>
        </div>
      )}

      {step === "profile" && (
        <div>
          <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-sm)" }}>
            {mode === "pillion"
              ? "Before you join as pillion, the group needs a name and an emergency contact."
              : "Before you join, the group needs a name, an emergency contact and your vehicle's registration number."}
          </p>
          <p
            style={{
              fontSize: "var(--text-caption)",
              color: "var(--color-text-tertiary)",
              margin: "0 0 var(--space-md)",
            }}
          >
            * required
          </p>
          <Field
            label="First name"
            required
            error={!firstName.trim() ? "First name is required." : undefined}
          >
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Your first name"
              autoComplete="given-name"
              aria-required="true"
            />
          </Field>
          <Field label="Last name (optional)">
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Your last name"
              autoComplete="family-name"
            />
          </Field>
          <Field label="Emergency contact name" required>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Who to call"
              aria-required="true"
            />
          </Field>
          <Field label="Emergency contact phone" required>
            <Input
              type="tel"
              inputMode="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Phone number"
              aria-required="true"
            />
          </Field>
          {mode === "own" && (
            <Field label="Vehicle registration number" required>
              <Input
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="e.g. KA01AB1234"
                autoCapitalize="characters"
                aria-required="true"
              />
            </Field>
          )}

          {profileIncomplete && (
            <p style={{ color: "var(--color-text-tertiary)", margin: "0 0 var(--space-md)", fontSize: "var(--text-caption)" }}>
              These details keep the group safe if something goes wrong — you can still join without
              them for now and finish your profile later.
            </p>
          )}
          {profileStatus && (profileStatus.hasEmergencyContact || profileStatus.hasVehicle || profileStatus.firstName) && (
            <p style={{ color: "var(--color-text-tertiary)", margin: "0 0 var(--space-md)", fontSize: "var(--text-caption)" }}>
              We reused details already on file for you.
            </p>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-sm)",
              minHeight: 56,
              cursor: "pointer",
              marginBottom: "var(--space-md)",
            }}
          >
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                marginTop: 2,
                flexShrink: 0,
                accentColor: "var(--color-accent)",
              }}
              aria-required="true"
            />
            <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-body-size)" }}>
              I agree to RideInSync handling my data (including for emergencies) per its terms and
              privacy policy.
              <span
                style={{
                  color: "var(--color-role-sweep)",
                  marginLeft: "var(--space-2xs)",
                }}
                aria-hidden="true"
              >
                *
              </span>
            </span>
          </label>

          {error && (
            <p style={{ color: "var(--color-role-sweep)", marginBottom: "var(--space-md)" }}>{error}</p>
          )}
          <Button
            onClick={() => void handleJoinFromProfile()}
            loading={loading}
            disabled={!consentChecked || !firstName.trim()}
          >
            {profileIncomplete ? "Join anyway" : mode === "pillion" ? "Continue" : "Join ride"}
          </Button>
        </div>
      )}

      {step === "linkRider" && (
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
          {eligibleRiders.length === 0 ? (
            <Card padding="var(--space-lg)" style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-body-size)" }}>
                None of the riders in this ride have joined yet.
              </p>
              <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
                Ask your rider to join first, then check again.
              </p>
            </Card>
          ) : (
            <>
              <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-md)" }}>
                Whose bike are you riding on?
                <span
                  style={{
                    color: "var(--color-role-sweep)",
                    marginLeft: "var(--space-2xs)",
                  }}
                  aria-hidden="true"
                >
                  *
                </span>
              </p>
              {eligibleRiders.map((r) => {
                const active = r.userId === selectedRiderId;
                return (
                  <Card
                    key={r.userId}
                    padding="var(--space-md)"
                    onClick={() => setSelectedRiderId(r.userId)}
                    style={{
                      marginBottom: "var(--space-sm)",
                      cursor: "pointer",
                      minHeight: 56,
                      display: "flex",
                      alignItems: "center",
                      border: active ? "1px solid var(--color-accent)" : "1px solid transparent",
                    }}
                  >
                    {r.displayName}
                  </Card>
                );
              })}
            </>
          )}

          {error && (
            <p style={{ color: "var(--color-role-sweep)", margin: "var(--space-md) 0" }}>{error}</p>
          )}

          {eligibleRiders.length === 0 ? (
            <>
              <Button
                style={{ marginTop: "var(--space-md)" }}
                onClick={() => joinedRideId && void loadEligibleRiders(joinedRideId)}
                loading={loading}
              >
                Check again
              </Button>
              <Button
                variant="secondary"
                style={{ marginTop: "var(--space-sm)" }}
                onClick={() => joinedRideId && navigate(`/ride/${joinedRideId}`)}
              >
                Go to ride anyway
              </Button>
            </>
          ) : (
            <Button
              style={{ marginTop: "var(--space-lg)" }}
              onClick={() => void handleConfirmLink()}
              disabled={!selectedRiderId}
              loading={loading}
            >
              Confirm & join
            </Button>
          )}
        </div>
      )}

      {step === "pending" && (
        <div>
          <Card padding="var(--space-lg)" style={{ textAlign: "center" }}>
            {requestStatus === "rejected" ? (
              <>
                <p style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-body-size)" }}>
                  The lead declined your request to join{preview ? ` "${preview.name}"` : ""}.
                </p>
                <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
                  Check with the lead, or try a different join code.
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 var(--space-sm)", fontSize: "var(--text-body-size)" }}>
                  Request sent{preview ? ` to join "${preview.name}"` : ""}.
                </p>
                <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
                  Waiting for the lead to approve — this updates automatically.
                </p>
              </>
            )}
          </Card>
          {error && (
            <p style={{ color: "var(--color-role-sweep)", margin: "var(--space-md) 0 0" }}>{error}</p>
          )}
          {requestStatus === "pending" && (
            <Button
              variant="secondary"
              style={{ marginTop: "var(--space-lg)" }}
              onClick={() => void handleWithdraw()}
              loading={withdrawing}
            >
              Withdraw request
            </Button>
          )}
          <Link to="/" style={{ display: "block", marginTop: "var(--space-sm)" }}>
            <Button variant="secondary">Back to home</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
