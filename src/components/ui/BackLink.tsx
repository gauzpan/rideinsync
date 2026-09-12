import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

/** Shared style for the raised back-link pill chip.
 *  Exported as a pure seam so unit tests can assert the pill/raised treatment
 *  without rendering react-router's <Link> (there is no DOM under node:test). */
export const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px 0 8px",
  borderRadius: "var(--radius-full)",
  background:
    "var(--grad-surface, linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0) 60%)), var(--color-surface-2)",
  borderTop: "1px solid rgba(255,255,255,.06)",
  boxShadow:
    "var(--shadow-raised, inset 0 1px 0 rgba(255,255,255,.08), 0 1px 0 rgba(0,0,0,.6), 0 6px 16px rgba(0,0,0,.45))",
  color: "var(--color-text-primary)",
  fontSize: "var(--text-label)",
  textDecoration: "none",
  // Old link was inline text sitting above a heading with margin-top space-sm
  // (or a Card with margin-top space-lg). The chip is a taller atomic box, so
  // it owns its own gap to the content below to keep spacing close to before.
  marginBottom: 12,
  whiteSpace: "nowrap",
};

type Props = Omit<ComponentProps<typeof Link>, "children"> & {
  children: ReactNode;
};

/** Back / breadcrumb control styled as a soft-raised pill chip, matching the
 *  Button/Card 3D treatment. `.ui-raised` gives the shared :active press state
 *  (defined in global.css by the design lane). */
export function BackLink({ children, style, ...rest }: Props) {
  return (
    <Link className="ui-raised" style={{ ...backLinkStyle, ...style }} {...rest}>
      <Icon name="chevron-left" size={16} />
      {children}
    </Link>
  );
}
