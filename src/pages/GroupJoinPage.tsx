import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { LoadingState } from "../components/ui/Loader";
import { useAuth } from "../hooks/useAuth";
import { useInstallPrompt } from "../lib/installApp";
import { joinGroupByCode } from "../services/groupsService";

/** Lands here from a group invite link (/groups/join/:code). AppLayout
 *  already gates this route behind sign-in and resumes here after a Google
 *  redirect, so by the time this renders the user is authenticated — join
 *  immediately, offer to install the app (same prompt as RiderJoinPage), then
 *  hand off to the group. */
export function GroupJoinPage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);
  const install = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!code || !user || attempted.current) return;
    attempted.current = true;
    joinGroupByCode(code)
      .then(setGroupId)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't join that group."));
  }, [code, user]);

  if (error) {
    return (
      <div>
        <BackLink to="/groups">Groups</BackLink>
        <Card padding="var(--space-lg)" style={{ marginTop: "var(--space-lg)" }}>
          <p style={{ margin: "0 0 var(--space-sm)" }}>Couldn't join with code {code}.</p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{error}</p>
        </Card>
      </div>
    );
  }

  if (!groupId) {
    return <LoadingState label="Joining group…" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", paddingTop: "var(--space-xl)" }}>
      <Card glow padding="var(--space-lg)" style={{ textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: "var(--text-h2)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
          You're in
        </p>
        <p style={{ margin: "var(--space-2xs) 0 0", color: "var(--color-text-secondary)" }}>
          Joined with code {code}.
        </p>
      </Card>

      {install.platform === "installable" && (
        <Card padding="var(--space-md)">
          <p style={{ margin: "0 0 var(--space-sm)", color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>
            Install RideInSync on this phone for faster access next time.
          </p>
          <Button
            variant="secondary"
            loading={installing}
            onClick={() => {
              setInstalling(true);
              void install.install().finally(() => setInstalling(false));
            }}
          >
            Install app
          </Button>
        </Card>
      )}

      {install.platform === "ios-manual" && (
        <Card padding="var(--space-md)">
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}>
            Tap the Share icon, then "Add to Home Screen", to open RideInSync straight from this
            phone next time.
          </p>
        </Card>
      )}

      <Button onClick={() => navigate(`/groups/${groupId}`, { replace: true })}>Go to group</Button>
    </div>
  );
}
