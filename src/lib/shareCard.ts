// ============================================================================
// Flow 6 — social share card. Generates a branded PNG (own stats only, route
// generalized to city→city, no raw GPS, no co-rider PII) and shares it via
// navigator.share, falling back to a link copy. App logo (convoy chevrons)
// top-right, per the design system.
// ============================================================================

const ACCENT = "#C4F82A";
const BG = "#0A0A0B";
const WHITE = "#FFFFFF";
const MUTED = "#9A9A9E";

export type ShareCardData = {
  rideName: string;
  fromCity: string;
  toCity: string;
  distanceKm: number;
  durationMin: number;
  badges: string[]; // display names
  appUrl: string;
};

/** Draw the convoy-chevron mark at (x,y) sized `s` on the canvas. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const chevrons: [number, string][] = [
    [0, "#3A3A3C"],
    [0.19, WHITE],
    [0.38, ACCENT],
  ];
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [dx, color] of chevrons) {
    const ox = x + dx * s;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + s * 0.28, y + s * 0.25);
    ctx.lineTo(ox, y + s * 0.5);
    ctx.stroke();
  }
}

/** Render the 1080×1080 share card to a PNG Blob. */
export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Background + ambient glow.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(880, 200, 0, 880, 200, 520);
  glow.addColorStop(0, "rgba(178,232,46,0.16)");
  glow.addColorStop(1, "rgba(178,232,46,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Logo top-right.
  drawMark(ctx, 900, 90, 120);

  // Wordmark.
  ctx.fillStyle = WHITE;
  ctx.font = "600 44px Poppins, system-ui, sans-serif";
  ctx.fillText("RideInSync", 80, 140);

  // Ride name + route.
  ctx.font = "600 68px Inter, system-ui, sans-serif";
  ctx.fillText(d.rideName, 80, 320);
  ctx.fillStyle = MUTED;
  ctx.font = "400 40px Inter, system-ui, sans-serif";
  ctx.fillText(`${d.fromCity}  →  ${d.toCity}`, 80, 390);

  // Big stats.
  ctx.fillStyle = ACCENT;
  ctx.font = "600 140px Inter, system-ui, sans-serif";
  ctx.fillText(`${d.distanceKm.toFixed(0)} km`, 80, 620);
  ctx.fillStyle = WHITE;
  ctx.font = "600 64px Inter, system-ui, sans-serif";
  const h = Math.floor(d.durationMin / 60);
  const m = d.durationMin % 60;
  ctx.fillText(`${h}h ${m}m riding`, 80, 720);

  // Badges.
  if (d.badges.length) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 36px Inter, system-ui, sans-serif";
    ctx.fillText(`Badges: ${d.badges.join(" · ")}`, 80, 830);
  }

  // Footer CTA.
  ctx.fillStyle = MUTED;
  ctx.font = "400 34px Inter, system-ui, sans-serif";
  ctx.fillText(`Ride together, stay in sync — ${d.appUrl}`, 80, 1000);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

/** Share the card via the native sheet; fall back to copying the app link. */
export async function shareRide(d: ShareCardData): Promise<"shared" | "link-copied" | "unsupported"> {
  const blob = await renderShareCard(d);
  const file = new File([blob], "rideinsync.png", { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: d.rideName, text: "My ride on RideInSync" });
    return "shared";
  }
  if (nav.share) {
    await nav.share({ title: d.rideName, text: "My ride on RideInSync", url: d.appUrl });
    return "shared";
  }
  try {
    await navigator.clipboard.writeText(d.appUrl);
    return "link-copied";
  } catch {
    return "unsupported";
  }
}
