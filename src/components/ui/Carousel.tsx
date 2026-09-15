import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode[];
  /** Auto-advance interval in ms. 0 disables. */
  autoAdvanceMs?: number;
  "aria-label"?: string;
  onUserEngage?: (via: "swipe" | "wheel" | "dot") => void;
};

/**
 * Scroll-snap carousel: swipeable track + clickable dots, auto-advance that
 * pauses on interaction. Token-driven per design/ (lime dot = active slide).
 */
export function Carousel({ children, autoAdvanceMs = 5000, onUserEngage, ...rest }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = children.length;

  const engagedRef = useRef(false);
  const handleEngage = useCallback(
    (via: "swipe" | "wheel" | "dot") => {
      if (engagedRef.current) return;
      engagedRef.current = true;
      onUserEngage?.(via);
    },
    [onUserEngage]
  );

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = ((i % count) + count) % count;
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
  };

  // Keep the active dot in sync with manual scrolling.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      setActive(i);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  // Listen for human input on the track only (auto-advance never fires these).
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !onUserEngage) return;
    let start: { x: number; y: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) handleEngage("wheel"); // horizontal intent only
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) handleEngage("swipe"); // horizontal drag only
    };
    track.addEventListener("wheel", onWheel, { passive: true });
    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      track.removeEventListener("wheel", onWheel);
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchmove", onTouchMove);
    };
  }, [onUserEngage, handleEngage]);

  // Auto-advance.
  useEffect(() => {
    if (!autoAdvanceMs || paused) return;
    const id = setInterval(() => goTo(active + 1), autoAdvanceMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, autoAdvanceMs]);

  return (
    <div
      {...rest}
      role="group"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={trackRef}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          gap: 0,
        }}
      >
        {children.map((child, i) => (
          <div
            key={i}
            aria-hidden={active !== i}
            style={{ flex: "0 0 100%", scrollSnapAlign: "center", minWidth: 0 }}
          >
            {child}
          </div>
        ))}
      </div>

      {/* Dots */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "var(--space-xs)",
          marginTop: "var(--space-md)",
        }}
      >
        {children.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={active === i}
            onClick={() => {
              handleEngage("dot");
              goTo(i);
            }}
            style={{
              width: active === i ? 24 : 8,
              height: 8,
              padding: 0,
              border: "none",
              cursor: "pointer",
              borderRadius: "var(--radius-full)",
              background: active === i ? "var(--color-accent)" : "var(--color-surface-4)",
              transition: "width .2s ease, background .2s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
