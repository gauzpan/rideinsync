import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Select, type SelectOption } from "../components/ui/Select";
import { useAuth } from "../hooks/useAuth";
import { usePersistedToggle } from "../lib/preference";
import { VOICE_COMMANDS_KEY } from "../lib/voiceCommands";
import { useInstallPrompt } from "../lib/installApp";
import type { AgeBand, Gender } from "../lib/models";
import { pickDocumentFile, pickImageFile } from "../services/cameraService";
import {
  getRichProfile,
  submitMedicalProfile,
  submitMinimumProfile,
  submitPersonalDetails,
  submitVehicleDetails,
  uploadAvatar,
  uploadDrivingLicence,
  type RichProfile,
} from "../services/onboardingService";

const GENDER_OPTIONS: SelectOption[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const AGE_BAND_OPTIONS: SelectOption[] = [
  { value: "18_25", label: "18–25" },
  { value: "26_35", label: "26–35" },
  { value: "36_45", label: "36–45" },
  { value: "46_55", label: "46–55" },
  { value: "56_plus", label: "56+" },
];

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
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
    </div>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card padding="var(--space-lg)" style={{ marginBottom: "var(--space-lg)" }}>
      <h2
        style={{
          fontSize: "var(--text-h2)",
          lineHeight: "var(--lh-h2)",
          fontWeight: "var(--weight-semibold)",
          margin: "0 0 var(--space-2xs)",
        }}
      >
        {title}
      </h2>
      {hint && (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
          {hint}
        </p>
      )}
      {children}
    </Card>
  );
}

/** Optional, skippable profile depth — avatar, vehicle make/model/colour,
 *  medical profile, driving-licence upload (ticket 08). None of this blocks
 *  joining a ride; it's reachable from ride detail during onboarding, or
 *  later from the Flow 2 dashboard. Each section saves independently. */
export function RichProfilePage() {
  const { user, signOut, refreshProfile } = useAuth();
  const [voiceOn, setVoiceOn] = usePersistedToggle(VOICE_COMMANDS_KEY, false);
  const install = useInstallPrompt();
  const [installing, setInstalling] = useState(false);
  const [searchParams] = useSearchParams();
  const rideId = searchParams.get("rideId");
  const backTo = rideId ? `/ride/${rideId}` : "/menu";

  const [profile, setProfile] = useState<RichProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [basicSaving, setBasicSaving] = useState(false);
  const [basicSaved, setBasicSaved] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [ageBand, setAgeBand] = useState<AgeBand | "">("");
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalSaved, setPersonalSaved] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  const [makeModel, setMakeModel] = useState("");
  const [color, setColor] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleSaved, setVehicleSaved] = useState(false);

  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [notes, setNotes] = useState("");
  const [medicalSaving, setMedicalSaving] = useState(false);
  const [medicalSaved, setMedicalSaved] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [licenceUploading, setLicenceUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    getRichProfile(user.id)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p.displayName);
        setPhone(p.phone);
        setContactName(p.emergencyContact?.name ?? "");
        setContactPhone(p.emergencyContact?.phone ?? "");
        setFirstName(p.firstName ?? "");
        setLastName(p.lastName ?? "");
        setGender(p.gender ?? "");
        setAgeBand(p.ageBand ?? "");
        setMakeModel(p.vehicle?.make_model && p.vehicle.make_model !== "Not specified yet" ? p.vehicle.make_model : "");
        setColor(p.vehicle?.color ?? "");
        setPlate(p.plate ?? p.vehicle?.plate ?? "");
        setBloodType(p.medical?.blood_type ?? "");
        setAllergies(p.medical?.allergies ?? "");
        setMedications(p.medical?.medications ?? "");
        setNotes(p.medical?.notes ?? "");
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load your profile."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSavePersonal() {
    if (!user) return;
    setPersonalError(null);
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setPersonalError("First name is required.");
      return;
    }
    setPersonalSaving(true);
    setPersonalSaved(false);
    try {
      await submitPersonalDetails(user.id, {
        firstName: trimmedFirst,
        lastName: lastName.trim() || undefined,
        gender: (gender as Gender) || null,
        ageBand: (ageBand as AgeBand) || null,
      });
      setPersonalSaved(true);
      await refreshProfile();
    } catch (e) {
      setPersonalError(e instanceof Error ? e.message : "Couldn't save personal details.");
    } finally {
      setPersonalSaving(false);
    }
  }

  async function handleAvatarPick() {
    if (!user) return;
    setError(null);
    try {
      const file = await pickImageFile();
      if (!file) return;
      setAvatarUploading(true);
      const url = await uploadAvatar(user.id, file);
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that photo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSaveBasic() {
    if (!user) return;
    setError(null);
    setBasicSaving(true);
    setBasicSaved(false);
    try {
      // vehiclePlate left blank so this call only touches name/contact —
      // the Vehicle characteristics section below owns the plate field.
      await submitMinimumProfile(user.id, {
        displayName,
        phone,
        emergencyContactName: contactName,
        emergencyContactPhone: contactPhone,
        vehiclePlate: "",
      });
      setBasicSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your details.");
    } finally {
      setBasicSaving(false);
    }
  }

  async function handleSaveVehicle() {
    if (!user) return;
    setError(null);
    setVehicleSaving(true);
    setVehicleSaved(false);
    try {
      await submitVehicleDetails(user.id, { makeModel, color, plate });
      setVehicleSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save vehicle details.");
    } finally {
      setVehicleSaving(false);
    }
  }

  async function handleSaveMedical() {
    if (!user) return;
    setError(null);
    setMedicalSaving(true);
    setMedicalSaved(false);
    try {
      await submitMedicalProfile(user.id, { bloodType, allergies, medications, notes });
      setMedicalSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your medical profile.");
    } finally {
      setMedicalSaving(false);
    }
  }

  async function handleLicencePick() {
    if (!user) return;
    setError(null);
    try {
      const file = await pickDocumentFile();
      if (!file) return;
      setLicenceUploading(true);
      const doc = await uploadDrivingLicence(user.id, file);
      setProfile((p) => (p ? { ...p, licence: doc } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload your licence.");
    } finally {
      setLicenceUploading(false);
    }
  }

  const initials = (firstName.trim() || displayName || user?.email || "R").slice(0, 1).toUpperCase();

  return (
    <div>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-2xs)",
        }}
      >
        Complete your profile
      </h1>
      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-lg)" }}>
        All optional, skip anything you don't have handy now and finish it later. None of this
        blocks you from joining or riding.
      </p>

      {loading && <p style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}

      {!loading && (
        <>
          <SectionCard title="Personal details" hint="Used for emergency response and medical identification.">
            <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
              * required
            </p>
            <Field label="First name" required>
              <Input
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setPersonalSaved(false);
                  setPersonalError(null);
                }}
                placeholder="e.g. Alex"
                autoComplete="given-name"
                aria-required="true"
              />
            </Field>
            <Field label="Last name (optional)">
              <Input
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  setPersonalSaved(false);
                }}
                placeholder="e.g. Smith"
                autoComplete="family-name"
              />
            </Field>
            <Field label="Gender (optional)">
              <Select
                value={gender}
                placeholder="Select gender"
                options={GENDER_OPTIONS}
                onChange={(val) => {
                  setGender(val as Gender | "");
                  setPersonalSaved(false);
                }}
              />
            </Field>
            <Field label="Age band (optional)">
              <Select
                value={ageBand}
                placeholder="Select age band"
                options={AGE_BAND_OPTIONS}
                onChange={(val) => {
                  setAgeBand(val as AgeBand | "");
                  setPersonalSaved(false);
                }}
              />
            </Field>
            {personalError && (
              <p style={{ color: "var(--color-role-sweep)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
                {personalError}
              </p>
            )}
            {personalSaved && (
              <p style={{ color: "var(--color-accent)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
                Saved.
              </p>
            )}
            <Button variant="secondary" onClick={() => void handleSavePersonal()} loading={personalSaving}>
              Save personal details
            </Button>
          </SectionCard>

          <SectionCard title="Avatar">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-surface-3)",
                  backgroundImage: profile?.avatarUrl ? `url(${profile.avatarUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--text-h2)",
                  fontWeight: "var(--weight-semibold)" as unknown as number,
                  flexShrink: 0,
                }}
              >
                {!profile?.avatarUrl && initials}
              </div>
              <Button
                variant="secondary"
                fullWidth={false}
                onClick={() => void handleAvatarPick()}
                loading={avatarUploading}
              >
                {profile?.avatarUrl ? "Change photo" : "Add photo"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Your details" hint="Shown to the rest of your ride, and used to reach your emergency contact if needed.">
            <Field label="Email address">
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-body-size)" }}>
                {user?.email ?? "Not signed in with an email"}
              </p>
            </Field>
            <Field label="Phone number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 98765 43210" />
            </Field>
            <Field label="Emergency contact name">
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Priya Sharma" />
            </Field>
            <Field label="Emergency contact phone">
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="e.g. 98765 43210" />
            </Field>
            {basicSaved && (
              <p style={{ color: "var(--color-accent)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
                Saved.
              </p>
            )}
            <Button variant="secondary" onClick={() => void handleSaveBasic()} loading={basicSaving}>
              Save details
            </Button>
          </SectionCard>

          {install.platform === "installable" && (
            <SectionCard
              title="Install app"
              hint="Add RideInSync to your home screen or desktop for faster access and full notification support, even when the browser tab is closed."
            >
              <Button
                variant="secondary"
                fullWidth={false}
                loading={installing}
                onClick={() => {
                  setInstalling(true);
                  void install.install().finally(() => setInstalling(false));
                }}
              >
                Install app
              </Button>
            </SectionCard>
          )}

          {install.platform === "ios-manual" && (
            <SectionCard
              title="Install app"
              hint="iOS doesn't support notifications in a browser tab — install to your home screen for alerts to reach you while riding."
            >
              <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: "var(--text-body-size)" }}>
                Tap the Share icon, then "Add to Home Screen".
              </p>
            </SectionCard>
          )}

          <SectionCard
            title="Voice commands"
            hint={`Say "sync" followed by SOS, hazard, regroup, or pit stop to signal hands-free during an active ride.`}
          >
            <SegmentedControl
              options={["On", "Off"]}
              value={voiceOn ? "On" : "Off"}
              onChange={(v) => setVoiceOn(v === "On")}
            />
          </SectionCard>

          <SectionCard title="Vehicle characteristics" hint="Registration number and characteristics of your bike.">
            <Field label="Registration number">
              <Input
                value={plate}
                onChange={(e) => {
                  setPlate(e.target.value.toUpperCase());
                  setVehicleSaved(false);
                }}
                placeholder="e.g. KA01AB1234"
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Make & model">
              <Input
                value={makeModel}
                onChange={(e) => {
                  setMakeModel(e.target.value);
                  setVehicleSaved(false);
                }}
                placeholder="e.g. Royal Enfield Classic 350"
              />
            </Field>
            <Field label="Colour">
              <Input
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setVehicleSaved(false);
                }}
                placeholder="e.g. Black"
              />
            </Field>
            {vehicleSaved && (
              <p style={{ color: "var(--color-accent)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
                Saved.
              </p>
            )}
            <Button variant="secondary" onClick={() => void handleSaveVehicle()} loading={vehicleSaving}>
              Save vehicle details
            </Button>
          </SectionCard>

          <SectionCard title="Medical profile" hint="Owner-only, never shown to the rest of the group.">
            <Field label="Blood type">
              <Input value={bloodType} onChange={(e) => setBloodType(e.target.value)} placeholder="e.g. O+" />
            </Field>
            <Field label="Allergies">
              <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin" />
            </Field>
            <Field label="Medications">
              <Input value={medications} onChange={(e) => setMedications(e.target.value)} placeholder="e.g. Insulin" />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else responders should know" />
            </Field>
            {medicalSaved && (
              <p style={{ color: "var(--color-accent)", fontSize: "var(--text-caption)", margin: "0 0 var(--space-md)" }}>
                Saved.
              </p>
            )}
            <Button variant="secondary" onClick={() => void handleSaveMedical()} loading={medicalSaving}>
              Save medical profile
            </Button>
          </SectionCard>

          <SectionCard title="Driving licence" hint="Owner-only, a photo or scan of your licence.">
            {profile?.licence && (
              <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-md)" }}>
                Uploaded {new Date(profile.licence.uploaded_at).toLocaleDateString()}.
              </p>
            )}
            <Button variant="secondary" onClick={() => void handleLicencePick()} loading={licenceUploading}>
              {profile?.licence ? "Replace licence" : "Upload licence"}
            </Button>
          </SectionCard>

          {error && <p style={{ color: "var(--color-role-sweep)", margin: "0 0 var(--space-md)" }}>{error}</p>}

          <Link to={backTo}>
            <Button>Done</Button>
          </Link>

          {/* Last item on the page, per design — sign-out used to live in
              AccountBar's top-right menu; moved here instead. */}
          <Button variant="ghost" onClick={() => void signOut()} style={{ marginTop: "var(--space-md)" }}>
            Sign out
          </Button>
        </>
      )}
    </div>
  );
}
