import { useState, type ComponentProps, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Carousel } from "../components/ui/Carousel";
import { Icon } from "../components/ui/Icon";
import { usePersistedToggle } from "../lib/preference";
import { TOUR_WELCOME_KEY } from "../lib/tour";

type IconName = ComponentProps<typeof Icon>["name"];

type Slide = {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: ReactNode;
  /** Optional "go try it" deep link (secondary text button). */
  link?: { label: string; to: string };
};

// Signature mixed-weight device: a bold-white key phrase inside a muted line.
function Em({ children }: { children: ReactNode }) {
  return (
    <strong style={{ color: "var(--color-text-primary)", fontWeight: "var(--weight-semibold)" as unknown as number }}>
      {children}
    </strong>
  );
}

const slides: Slide[] = [
  {
    icon: "users",
    eyebrow: "Welcome to RideInSync",
    title: "Ride together, stay together",
    body: (
      <>
        One live map shows <Em>every rider's position and status</Em>, so the group moves as one instead of scattering.
      </>
    ),
    link: { label: "View a demo ride", to: "/ride/demo" },
  },
  {
    icon: "plus",
    eyebrow: "Leading",
    title: "Lead a ride",
    body: (
      <>
        Set your route in under a minute, then share a <Em>code or QR</Em> to gather your pack.
      </>
    ),
    link: { label: "Create a ride", to: "/ride/create" },
  },
  {
    icon: "share",
    eyebrow: "Joining",
    title: "Join in seconds",
    body: (
      <>
        Enter a code or scan a QR. You're in the group the moment the lead <Em>approves you</Em>.
      </>
    ),
    link: { label: "Join a ride", to: "/join" },
  },
  {
    icon: "map",
    eyebrow: "On the map",
    title: "Know the pack",
    body: (
      <>
        Lead, co-lead, sweep and rider pins, each tagged <Em>intact, behind or stopped</Em> at a glance.
      </>
    ),
    link: { label: "Open the live map", to: "/ride/demo" },
  },
  {
    icon: "signal",
    eyebrow: "Safety",
    title: "Help, one tap away",
    body: (
      <>
        Hit SOS to alert everyone at once, or signal your group <Em>hands-free with your voice</Em>.
      </>
    ),
    link: { label: "Try voice commands", to: "/profile" },
  },
  {
    icon: "flag",
    eyebrow: "After the ride",
    title: "Finish strong",
    body: (
      <>
        A ride summary, badges and reached-home checks close the loop, with a place to <Em>share feedback</Em> anytime.
      </>
    ),
  },
];

/**
 * First-run tour, shown once after sign-in (AppLayout redirects /home →
 * /welcome until TOUR_WELCOME_KEY is set). Immersive full-screen sheet borrowed
 * from VoicePermissionSheet: swipeable slides, one accent action per view, a
 * per-slide "go try it" deep link, and a Skip. Any exit path (finish, skip, or
 * a deep link) marks the tour seen so it never blocks a returning rider.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const [, setSeen] = usePersistedToggle(TOUR_WELCOME_KEY, false);
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;
  const onLast = index === last;
  const slide = slides[index];

  // Finishing or skipping records the tour as seen, then leaves for good.
  function finishTo(to: string) {
    setSeen(true);
    navigate(to, { replace: true });
  }

  // A per-slide deep link is "go try it, then come back": pushed (not replaced)
  // so browser/gesture back returns to this slide, and the tour is left unseen
  // so heading to /home reopens it — the rider hasn't chosen to finish yet.
  function exploreVia(to: string) {
    navigate(to);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-base)",
        zIndex: 100,
      }}
    >
      {/* Ambient brand glow, mirroring the landing hero. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 300,
          height: 300,
          borderRadius: "var(--radius-full)",
          background: "radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          maxWidth: 600,
          margin: "0 auto",
          // Wider than the app gutter so the title, body, and the badge's
          // accent glow all keep clear of the screen edge.
          padding: "var(--space-lg) var(--space-xl)",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <Carousel
          aria-label="What you can do with RideInSync"
          autoAdvanceMs={0}
          activeIndex={index}
          onActiveChange={setIndex}
        >
          {slides.map((s) => (
            <div
              key={s.title}
              style={{
                padding: "0 2px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minHeight: "50vh",
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "var(--radius-lg)",
                  display: "grid",
                  placeItems: "center",
                  // Lime-tinted badge — the icon's accent tied into its own
                  // background rather than floating on plain grey.
                  background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
                  color: "var(--color-accent)",
                  boxShadow: "var(--glow-accent)",
                  marginBottom: "var(--space-lg)",
                }}
              >
                <Icon name={s.icon} size={32} />
              </div>
              <p
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--color-accent)",
                  fontWeight: "var(--weight-semibold)" as unknown as number,
                  margin: "0 0 var(--space-2xs)",
                }}
              >
                {s.eyebrow}
              </p>
              <h1
                style={{
                  fontSize: "var(--text-h1)",
                  lineHeight: "var(--lh-h1)",
                  fontWeight: "var(--weight-semibold)",
                  margin: "0 0 var(--space-sm)",
                }}
              >
                {s.title}
              </h1>
              <p
                style={{
                  fontSize: "var(--text-body-size)",
                  lineHeight: "var(--lh-body)",
                  color: "var(--color-text-secondary)",
                  margin: 0,
                  maxWidth: 440,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </Carousel>
      </div>

      {/* Footer actions — one accent action per view, ghost skip, and the
          slide's optional deep link (secondary, never a competing accent). */}
      <div
        role="group"
        aria-label="Tour navigation"
        style={{
          background: "var(--color-surface-1)",
          borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-lg) var(--space-xl) calc(var(--space-2xl) + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
          width: "100%",
          maxWidth: 600,
          margin: "0 auto",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        <p aria-live="polite" style={{ margin: 0, textAlign: "center", fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)" }}>
          Slide {index + 1} of {slides.length}
        </p>

        {slide.link && (
          <button
            type="button"
            onClick={() => exploreVia(slide.link!.to)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2xs)",
              minHeight: 44,
              background: "none",
              border: "none",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-label)",
              fontWeight: "var(--weight-semibold)" as unknown as number,
              cursor: "pointer",
            }}
          >
            {slide.link.label}
            <Icon name="chevron-right" size={16} />
          </button>
        )}

        <Button onClick={() => (onLast ? finishTo("/home") : setIndex((i) => Math.min(i + 1, last)))}>
          {onLast ? "Start riding" : "Next"}
        </Button>
        <Button variant="ghost" onClick={() => finishTo("/home")}>
          Skip tour
        </Button>
      </div>
    </div>
  );
}
