// ============================================================================
// Flow 6 — social share card. Generates a branded PNG (own stats only, route
// generalized to city→city, no raw GPS, no co-rider PII) and shares it via
// navigator.share, falling back to a link copy. Stamped top-right with the
// real RideInSync brand lockup (design/components/core — same asset as
// src/components/ui/Logo.tsx), not a redrawn approximation.
// ============================================================================

const LOGO_SRC = "/icons/rideinsync-logo.png";

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
  /** User-supplied photo (data URL) drawn as the card background instead of
   *  the default ambient glow, with a dark scrim behind the text for contrast. */
  customImageDataUrl?: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the custom image."));
    img.src = src;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Render the 1080×1080 share card to a PNG Blob. */
export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Background: either a user-supplied photo (cover-fit, scrimmed for
  // contrast) or the default ambient glow.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);
  if (d.customImageDataUrl) {
    const img = await loadImage(d.customImageDataUrl);
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    ctx.fillStyle = "rgba(10,10,11,0.55)";
    ctx.fillRect(0, 0, size, size);
  } else {
    const glow = ctx.createRadialGradient(880, 200, 0, 880, 200, 520);
    glow.addColorStop(0, "rgba(178,232,46,0.16)");
    glow.addColorStop(1, "rgba(178,232,46,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  }

  // Brand lockup, stamped top-right (the real logo asset, not a redrawn mark).
  const logo = await loadImage(LOGO_SRC);
  const logoH = 64;
  const logoW = logo.width * (logoH / logo.height);
  ctx.drawImage(logo, size - 80 - logoW, 70, logoW, logoH);

  // Ride name + route.
  ctx.fillStyle = WHITE;
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

/** Render the card and save it straight to the user's device. */
export async function downloadShareCard(d: ShareCardData): Promise<void> {
  const blob = await renderShareCard(d);
  downloadBlob(blob, "rideinsync.png");
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

/** Instagram has no web share-intent for arbitrary images. On mobile the
 *  native share sheet (which lists Instagram as a target) is the closest
 *  direct handoff. Everywhere else — desktop, or a mobile browser without the
 *  File Web Share API — there is no way to hand Instagram a locally rendered
 *  image at all, so we download the card and *do* still redirect: the
 *  Instagram app via its custom URL scheme on mobile (falling back to
 *  instagram.com if the app isn't installed), or instagram.com directly on
 *  desktop, so the button always takes the user somewhere in Instagram to
 *  post the file they just got. */
export async function shareToInstagram(d: ShareCardData): Promise<"shared" | "app-opened" | "downloaded"> {
  const blob = await renderShareCard(d);
  const file = new File([blob], "rideinsync.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: d.rideName, text: "My ride on RideInSync" });
    return "shared";
  }

  downloadBlob(blob, "rideinsync.png");

  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isMobile) {
    const start = Date.now();
    window.location.href = "instagram://app";
    // If the app deep link had no handler, the page stays foregrounded and
    // this timeout fires close to on schedule; if it opened the app, the tab
    // backgrounds and the timer is delayed well past the threshold — the
    // standard app-link/web-fallback pattern.
    setTimeout(() => {
      if (Date.now() - start < 2000) {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      }
    }, 1200);
    return "app-opened";
  }

  window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  return "downloaded";
}

/** X only accepts a URL/text intent from the web (no image attach), so we
 *  open its compose intent and let the user attach the downloaded card. */
export function shareToX(d: ShareCardData): void {
  const text = `${d.rideName} — ${d.distanceKm.toFixed(0)}km with RideInSync`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(d.appUrl)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Same constraint as X — Facebook's sharer only takes a URL from the web. */
export function shareToFacebook(d: ShareCardData): void {
  const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(d.appUrl)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
