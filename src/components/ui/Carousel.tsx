import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode[];
  /** Auto-advance interval in ms. 0 disables. */
  autoAdvanceMs?: number;
  /** Controlled active slide. When set, the parent owns the index (e.g. a
   *  Next button in a footer); the carousel scrolls to match it. */
  activeIndex?: number;
  /** Fired with the new index whenever the active slide changes (swipe, dot,
   *  or controlled scroll) — lets a parent mirror the index in its own UI. */
  onActiveChange?: (index: number) => void;
  "aria-label"?: string;
};

/**
 * Scroll-snap carousel: swipeable track + clickable dots, auto-advance that
 * pauses on interaction. Token-driven per design/ (lime dot = active slide).
 * Runs uncontrolled by default; pass `activeIndex` + `onActiveChange` to drive
 * it from a parent (the welcome tour footer does this).
 */
export function Carousel({ children, autoAdvanceMs = 5000, activeIndex, onActiveChange, ...rest }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [internalActive, setInternalActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = children.length;
  const controlled = activeIndex != null;
  const active = controlled ? activeIndex : internalActive;

  // Latest onActiveChange, read from the scroll listener (registered once) so
  // an inline callback prop never goes stale.
  const onChangeRef = useRef(onActiveChange);
  onChangeRef.current = onActiveChange;

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = ((i % count) + count) % count;
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
  };

  // Keep the active dot in sync with scrolling. Debounced so it reports only
  // the settled slide: a programmatic (controlled) smooth-scroll passes through
  // intermediate offsets that round to the old index, and firing on those would
  // reset a controlled parent's index mid-animation and fight the scroll.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let settle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        setInternalActive(i);
        onChangeRef.current?.(i);
      }, 90);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(settle);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Controlled mode: scroll the track when the parent moves the index.
  useEffect(() => {
    if (controlled) goTo(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, active]);

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
            onClick={() => goTo(i)}
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
