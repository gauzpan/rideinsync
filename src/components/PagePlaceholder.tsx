import { Link } from "react-router-dom";
import { Card } from "./ui/Card";

type Props = {
  title: string;
  note?: string;
};

/** Temporary placeholder for a not-yet-built screen. */
export function PagePlaceholder({ title, note }: Props) {
  return (
    <div>
      <Link
        to="/"
        style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-label)" }}
      >
        ‹ Home
      </Link>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          fontWeight: "var(--weight-semibold)",
          margin: "var(--space-sm) 0 var(--space-lg)",
        }}
      >
        {title}
      </h1>
      <Card>
        <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          {note ?? "Not built yet."}
        </p>
      </Card>
    </div>
  );
}
