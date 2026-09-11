// Shared ride-role display constants — used by the ride-detail roster
// (RiderViewPage) and the lead's roster/approval screen (LeadViewPage).
import type { MemberRole } from "./models";

export const ROLE_LABEL: Record<MemberRole, string> = {
  leader: "Lead",
  co_leader: "Co-lead",
  sweep: "Sweep",
  rider: "Rider",
};

export const ROLE_COLOR: Record<MemberRole, string> = {
  leader: "var(--color-role-lead)",
  co_leader: "var(--color-role-lead)",
  sweep: "var(--color-role-sweep)",
  rider: "var(--color-role-member)",
};
