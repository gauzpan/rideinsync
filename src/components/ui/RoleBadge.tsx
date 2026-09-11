import type { CSSProperties } from "react";
import type { MemberRole } from "../../lib/models";

// Typed port of design/components/tracking/RoleBadge.jsx — keep the two in sync.
// The role colors are the design system's one sanctioned expansion beyond the
// single lime accent (lead = lime, sweep = coral, member = sky), justified by
// telling riders apart on a shared map.
type BadgeRole = "lead" | "sweep" | "member";

const CFG: Record<BadgeRole, { c: string; t: string; l: string }> = {
  lead: { c: "var(--color-role-lead)", t: "var(--color-text-on-accent)", l: "Lead" },
  sweep: { c: "var(--color-role-sweep)", t: "#1A0A06", l: "Sweep" },
  member: { c: "var(--color-role-member)", t: "#04121C", l: "Member" },
};

/** Maps the DB member role onto the three on-map role colors. */
export function toBadgeRole(role: MemberRole): BadgeRole {
  if (role === "leader" || role === "co_leader") return "lead";
  if (role === "sweep") return "sweep";
  return "member";
}

export function RoleBadge({ role = "member", style }: { role?: BadgeRole; style?: CSSProperties }) {
  const r = CFG[role] ?? CFG.member;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 10px",
        borderRadius: "var(--radius-full)",
        background: r.c,
        color: r.t,
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        fontWeight: "var(--weight-semibold)" as unknown as number,
        lineHeight: 1,
        ...style,
      }}
    >
      {r.l}
    </span>
  );
}
