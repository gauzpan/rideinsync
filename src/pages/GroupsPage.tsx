import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { RoleBadge } from "../components/ui/RoleBadge";
import { listMyGroups } from "../services/groupsService";
import type { GroupMemberRole, RideGroup } from "../lib/models";

type MyGroup = { role: GroupMemberRole; group: RideGroup };

/** Groups tab home: the rider's crews, with creation as the screen's one
 *  accent action. Group creation itself is the multi-step wizard at
 *  /groups/new. */
export function GroupsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listMyGroups(user.id)
      .then((rows) => !cancelled && setGroups(rows))
      // Keyless dev / backend-not-ready still gets the friendly empty
      // placeholder (matching the app's other stubbed screens); the error is
      // kept on the console instead of blocking the screen.
      .catch((e) => {
        console.warn("[groups] load failed", e);
        return !cancelled && setGroups([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", paddingBottom: "var(--space-lg)" }}>
      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-h1)", lineHeight: "var(--lh-h1)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
          Groups
        </h1>
        <p style={{ margin: "var(--space-2xs) 0 0", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
          Your riding crews — plan rides together, again and again.
        </p>
      </header>

      <Button variant="primary" onClick={() => navigate("/groups/new")}>
        Create a group
      </Button>

      {loading ? (
        <p style={{ margin: 0, fontSize: "var(--text-label)", color: "var(--color-text-tertiary)" }}>Loading…</p>
      ) : groups.length === 0 ? (
        <EmptyState />
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          {groups.map(({ group, role }) => (
            <button
              key={group.id}
              type="button"
              onClick={() => navigate(`/groups/${group.id}`)}
              style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}
            >
              <Card padding="var(--space-md)">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number }}>
                      {group.name}
                    </div>
                    {group.tagline && (
                      <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
                        {group.tagline}
                      </div>
                    )}
                    {group.city && (
                      <div style={{ marginTop: "var(--space-2xs)", fontSize: "var(--text-label)", color: "var(--color-text-tertiary)" }}>
                        {group.city}
                      </div>
                    )}
                  </div>
                  <RoleBadge role={role === "lead" ? "lead" : "member"} style={{ flex: "none" }} />
                </div>
              </Card>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

/** Empty placeholder — dashed, rounded border box (not a Card) so it reads as
 *  "nothing here yet" rather than a missing entry. */
function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-sm)",
        padding: "var(--space-2xl) var(--space-lg)",
        border: "1px dashed var(--color-divider)",
        borderRadius: "var(--radius-lg)",
        textAlign: "center",
      }}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-full)",
          background: "var(--color-surface-2)",
          color: "var(--color-text-tertiary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden="true"
      >
        <Icon name="users" size={26} />
      </span>
      <div style={{ fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--color-text-primary)" }}>
        No joined groups yet
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
        Your ride groups will be shown here
        <br />
        once you create one or join one.
      </p>
    </div>
  );
}
