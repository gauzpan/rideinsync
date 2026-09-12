import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Mark } from "./ui/Logo";
import { useAuth } from "../hooks/useAuth";
import { stashPendingJoinCode } from "../services/authService";

type Props = {
  /** Set when the sign-in sheet is showing over a `/join/:code` deep link —
   *  stashed before a Google redirect so the join resumes on return. */
  joinCode?: string;
};

type Step = "phone" | "otp";

/**
 * Sign-in sheet: primary entry gate offering phone SMS OTP sign-in, with
 * "Continue with Google" (secondary) and "Continue as guest".
 * Rendered full-screen (mobile PWA has no room for a true bottom sheet + backdrop)
 * but keeps the sheet visual language — a surface-1 card anchored to the bottom.
 */
export function SignInSheet({ joinCode }: Props) {
  const { signInWithGoogle, signInAsGuest, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState<"phone" | "otp" | "google" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSendOtp() {
    setError(null);
    const cleaned = phoneDigits.trim();
    if (!/^\d{10}$/.test(cleaned)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setPending("phone");
    try {
      await sendPhoneOtp(`+91${cleaned}`);
      setStep("otp");
      setResendCooldown(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send code. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    const cleanedOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanedOtp)) {
      setError("Enter the 6-digit code sent to your phone.");
      return;
    }
    setPending("otp");
    try {
      await verifyPhoneOtp(`+91${phoneDigits.trim()}`, cleanedOtp);
      // On success, onAuthStateChange fires and session updates in useAuth.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code. Check and try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || pending !== null) return;
    setError(null);
    setPending("phone");
    try {
      await sendPhoneOtp(`+91${phoneDigits.trim()}`);
      setResendCooldown(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resend code. Try again.");
    } finally {
      setPending(null);
    }
  }

  function handleChangeNumber() {
    setStep("phone");
    setOtp("");
    setError(null);
  }

  async function handleGoogle() {
    setError(null);
    setPending("google");
    try {
      if (joinCode) stashPendingJoinCode(joinCode);
      await signInWithGoogle();
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : "Couldn't start Google sign-in.");
    }
  }

  async function handleGuest() {
    setError(null);
    setPending("guest");
    try {
      await signInAsGuest();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in as guest.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        // Transparent so the Home wallpaper (AppLayout, z0) shows behind the
        // sign-in view on "/". On routes with no wallpaper the body's own
        // --color-bg-base canvas shows through unchanged. Form controls keep
        // their own opaque surface-1 card below, so legibility is unaffected.
        background: "transparent",
        zIndex: 100,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 280,
          height: 280,
          borderRadius: "var(--radius-full)",
          background: "radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          margin: "0 auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "var(--space-lg) var(--gutter)",
            position: "relative",
          }}
        >
          <Mark size={56} />
          <h1
            style={{
              fontSize: "var(--text-h1)",
              lineHeight: "var(--lh-h1)",
              fontWeight: "var(--weight-semibold)",
              margin: "var(--space-lg) 0 var(--space-xs)",
            }}
          >
            Welcome to RideInSync
          </h1>
          <p
            style={{
              fontSize: "var(--text-body-size)",
              lineHeight: "var(--lh-body)",
              color: "var(--color-text-secondary)",
              margin: 0,
              maxWidth: 420,
            }}
          >
            {joinCode
              ? `Sign in to join ride ${joinCode}. Enter your mobile number to get a code.`
              : "Sign in with your mobile number to lead or join group rides."}
          </p>
        </div>

        <div
          role="group"
          aria-label="Sign in"
          style={{
            background: "var(--color-surface-1)",
            borderTopLeftRadius: "var(--radius-lg)",
            borderTopRightRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: "var(--space-lg) var(--gutter) calc(var(--space-2xl) + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          {step === "phone" ? (
            <>
              <label
                htmlFor="phone-input"
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--color-text-secondary)",
                  fontWeight: "var(--weight-medium)" as unknown as number,
                }}
              >
                Mobile number
              </label>
              <div style={{ display: "flex", gap: "var(--space-xs)", alignItems: "center" }}>
                <div
                  aria-hidden="true"
                  style={{
                    height: "var(--control-height)",
                    padding: "0 var(--space-md)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--color-surface-2)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-body-size)",
                    fontWeight: "var(--weight-semibold)" as unknown as number,
                    flex: "none",
                  }}
                >
                  +91
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    id="phone-input"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    autoComplete="tel-national"
                    value={phoneDigits}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setPhoneDigits(val);
                      if (error) setError(null);
                    }}
                    placeholder="10-digit number"
                    aria-label="10-digit mobile number"
                    style={{ height: "var(--control-height)" }}
                  />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  style={{
                    color: "var(--color-role-sweep)",
                    fontSize: "var(--text-label)",
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              )}

              <Button
                onClick={() => void handleSendOtp()}
                disabled={pending !== null || phoneDigits.length !== 10}
                loading={pending === "phone"}
              >
                Send code
              </Button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label
                  htmlFor="otp-input"
                  style={{
                    fontSize: "var(--text-label)",
                    color: "var(--color-text-secondary)",
                    fontWeight: "var(--weight-medium)" as unknown as number,
                  }}
                >
                  Verification code
                </label>
                <button
                  type="button"
                  onClick={handleChangeNumber}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-accent)",
                    fontSize: "var(--text-caption)",
                    fontFamily: "var(--font-ui)",
                    cursor: "pointer",
                    padding: "var(--space-2xs)",
                  }}
                >
                  Change number
                </button>
              </div>

              <p
                style={{
                  fontSize: "var(--text-caption)",
                  color: "var(--color-text-tertiary)",
                  margin: 0,
                }}
              >
                Enter the 6-digit code sent to +91 {phoneDigits}
              </p>

              <Input
                id="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtp(val);
                  if (error) setError(null);
                }}
                placeholder="••••••"
                aria-label="6-digit verification code"
                style={{
                  height: "var(--control-height)",
                  textAlign: "center",
                  letterSpacing: "0.3em",
                  fontSize: "var(--text-h2)",
                }}
              />

              {error && (
                <p
                  role="alert"
                  style={{
                    color: "var(--color-role-sweep)",
                    fontSize: "var(--text-label)",
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              )}

              <Button
                onClick={() => void handleVerifyOtp()}
                disabled={pending !== null || otp.length !== 6}
                loading={pending === "otp"}
              >
                Verify & continue
              </Button>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || pending !== null}
                  onClick={() => void handleResendOtp()}
                  style={{
                    background: "none",
                    border: "none",
                    color: resendCooldown > 0 ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
                    fontSize: "var(--text-label)",
                    fontFamily: "var(--font-ui)",
                    cursor: resendCooldown > 0 ? "default" : "pointer",
                    padding: "var(--space-xs) var(--space-md)",
                    minHeight: 44,
                  }}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-sm)",
              margin: "var(--space-xs) 0",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            <span
              style={{
                fontSize: "var(--text-caption)",
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              or
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          </div>

          <Button
            variant="secondary"
            onClick={handleGoogle}
            disabled={pending !== null}
            loading={pending === "google"}
          >
            Continue with Google
          </Button>
          <Button
            variant="secondary"
            onClick={handleGuest}
            disabled={pending !== null}
            loading={pending === "guest"}
          >
            Continue as guest
          </Button>
          <p
            style={{
              fontSize: "var(--text-label)",
              color: "var(--color-text-tertiary)",
              textAlign: "center",
              margin: "var(--space-xs) 0 0",
            }}
          >
            By continuing you agree to share ride and safety details with your group.
          </p>
        </div>
      </div>
    </div>
  );
}
