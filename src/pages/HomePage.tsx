import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";

const nav: { label: string; to: string; variant?: "primary" | "secondary" }[] = [
  { label: "Create ride", to: "/create", variant: "primary" },
  { label: "Join ride", to: "/join", variant: "secondary" },
  { label: "Rider view", to: "/ride/demo", variant: "secondary" },
  { label: "Complete profile", to: "/profile", variant: "secondary" },
  { label: "Lead / sweep view", to: "/ride/demo/lead", variant: "secondary" },
  { label: "Demo controls", to: "/demo", variant: "secondary" },
];

export function HomePage() {
  const navigate = useNavigate();
  return (
    <div>
      <Logo size={36} />
      <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-sm)" }}>
        Voice-first group-ride coordination. Scaffold only — no functionality yet.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
          marginTop: "var(--space-xl)",
        }}
      >
        {nav.map((item) => (
          <Button key={item.to} variant={item.variant} onClick={() => navigate(item.to)}>
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
