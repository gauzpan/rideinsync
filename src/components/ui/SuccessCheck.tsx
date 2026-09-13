import "./SuccessCheck.css";

// Inline port of public/icons/sync-success.svg (ring + check), recolored to
// the accent token and animated as a brief draw-in. Mount it when a save
// succeeds and unmount it again ~1s later — it doesn't clear itself.
type Props = {
  /** Rendered px size (square). Default 28. */
  size?: number;
  /** Accessible label for the status region. Default "Saved". */
  label?: string;
};

export function SuccessCheck({ size = 28, label = "Saved" }: Props) {
  return (
    <span role="status" aria-label={label} style={{ display: "inline-block", width: size, height: size }}>
      <svg
        className="success-check"
        viewBox="0 0 48 48"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle className="success-check__ring" cx="24" cy="24" r="17" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        <path
          className="success-check__mark"
          d="M16 24.5 L21.5 30 L32 18"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
