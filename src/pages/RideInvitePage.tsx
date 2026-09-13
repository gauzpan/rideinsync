import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { IconButton } from "../components/ui/IconButton";
import { LoadingState } from "../components/ui/Loader";
import type { Ride } from "../lib/models";
import { buildJoinUrl, getRideById } from "../services/onboardingService";
import { generateQrDataUrl } from "../services/qrService";
import { copyToClipboard, shareContent } from "../services/shareService";

type CopyTarget = "code" | "link" | null;

export function RideInvitePage() {
  const { rideId } = useParams<{ rideId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const stateRide = (location.state as { ride?: Ride } | null)?.ride;
  const { user } = useAuth();   
  const [ride, setRide] = useState<Ride | null>(stateRide ?? null);
  const [loading, setLoading] = useState(!stateRide);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useEffect(() => {
    if (stateRide || !rideId) return;
    let cancelled = false;
    setLoading(true);
    getRideById(rideId)
      .then((r) => {
        if (cancelled) return;
        if (!r) setLoadError("Ride not found.");
        setRide(r);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Couldn't load ride."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rideId, stateRide]);

  const joinUrl = ride ? buildJoinUrl(ride.code) : "";

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    generateQrDataUrl(joinUrl).then((url) => !cancelled && setQrDataUrl(url));
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  async function handleCopy(target: Exclude<CopyTarget, null>) {
    if (!ride) return;
    const text = target === "code" ? ride.code : joinUrl;
    const ok = await copyToClipboard(text);
    setCopied(ok ? target : null);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleShare() {
    if (!ride) return;
    const result = await shareContent({
      title: ride.name,
      text: `Join "${ride.name}" on RideInSync — code ${ride.code}`,
      url: joinUrl,
    });
    if (result === "copied") setShareMessage("Link copied — share it your way.");
    else if (result === "unsupported") setShareMessage(null);
    else setShareMessage(null);
  }

  if (loading) {
    return <LoadingState label="Loading invite…" />;
  }

  if (loadError || !ride) {
    return (
      <div>
        <BackLink to="/">Home</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            {loadError ?? "Ride not found."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BackLink to="/">Home</BackLink>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-2xs)",
        }}
      >
        {ride.name}
      </h1>
      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 var(--space-xl)" }}>
        Ride created. Share this invite so riders can join.
      </p>

      <Card padding="var(--space-lg)" style={{ textAlign: "center" }}>
        <p
          style={{
            fontSize: "var(--text-label)",
            color: "var(--color-text-secondary)",
            margin: "0 0 var(--space-md)",
          }}
        >
          Join code
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-lg)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: "var(--text-display)",
              lineHeight: "var(--lh-display)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "0.08em",
              color: "var(--color-text-primary)",
            }}
          >
            {ride.code}
          </span>
          <IconButton name={copied === "code" ? "check" : "copy"} onClick={() => void handleCopy("code")} />
        </div>

        {qrDataUrl && (
          // The PNG itself is rendered with a white fill (see qrService) so it
          // scans reliably regardless of the app's dark/light theme.
          <div
            style={{
              display: "inline-block",
              padding: "var(--space-sm)",
              borderRadius: "var(--radius-md)",
              marginBottom: "var(--space-lg)",
              lineHeight: 0,
            }}
          >
            <img
              src={qrDataUrl}
              alt={`QR code to join ${ride.name}`}
              width={200}
              height={200}
              style={{ borderRadius: "var(--radius-sm)" }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-sm)",
            background: "var(--color-surface-3)",
            borderRadius: "var(--radius-full)",
            padding: "var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md)",
            marginBottom: "var(--space-lg)",
          }}
        >
          <span
            style={{
              fontSize: "var(--text-label)",
              color: "var(--color-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            {joinUrl}
          </span>
          <IconButton
            name={copied === "link" ? "check" : "copy"}
            variant="surface-4"
            size={40}
            onClick={() => void handleCopy("link")}
          />
        </div>

        <Button onClick={() => void handleShare()}>
          Share invite
        </Button>
        {shareMessage && (
          <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-sm)" }}>
            {shareMessage}
          </p>
        )}
      </Card>

      <Button
        variant="secondary"
        style={{ marginTop: "var(--space-lg)" }}
        onClick={() => navigate(`/ride/${ride.id}/lead`)}
      >
        Go to ride
      </Button>

      {ride.leader_id === user?.id && ride.status === "draft" && (
        <Button
          variant="secondary"
          style={{ marginTop: "var(--space-sm)" }}
          onClick={() => navigate(`/ride/${ride.id}/edit`)}
        >
          Edit ride
        </Button>
      )}
      
    </div>
  );
}
