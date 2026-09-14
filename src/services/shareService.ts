// Thin wrapper around clipboard / Web Share browser APIs — per decision D18,
// components never call navigator.clipboard / navigator.share directly.
// Swap-point for a future Capacitor Share/Clipboard plugin.

export type ShareResult = "shared" | "copied" | "unsupported";

export type ShareData = {
  title?: string;
  text?: string;
  url?: string;
};

/** Copies text to the clipboard. Returns false (rather than throwing) if the
 *  browser has no clipboard API or the user denies permission. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy fallback below
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
}

/** Uses the native share sheet when available (mobile browsers); falls back
 *  to copying the URL/text to the clipboard on desktop or unsupported browsers. */
export async function shareContent(data: ShareData): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      // AbortError = user dismissed the share sheet; treat as a no-op, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return "unsupported";
      // Any other failure: fall through to the clipboard fallback below.
    }
  }
  const fallbackText = data.url ?? data.text;
  if (fallbackText) {
    const ok = await copyToClipboard(fallbackText);
    return ok ? "copied" : "unsupported";
  }
  return "unsupported";
}

export type InviteShareData = ShareData & {
  /** PNG data URL of the join QR (see qrService.generateQrDataUrl). Attached
   *  as a file so messaging apps receive the image alongside the link. */
  qrDataUrl?: string | null;
  qrFileName?: string;
};

/** Shares an invite as link + QR image in one sheet. Where the platform can
 *  share files (mobile), the QR goes along as an image; otherwise degrades
 *  to the plain link share (then clipboard copy) via shareContent. */
export async function shareInvite(data: InviteShareData): Promise<ShareResult> {
  const files = await qrImageFile(data.qrDataUrl, data.qrFileName ?? "ride-qr.png");
  if (files && typeof navigator.canShare === "function" && navigator.canShare({ files })) {
    try {
      await navigator.share({ title: data.title, text: data.text, url: data.url, files });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "unsupported";
      // Any other failure: fall through to the link-only share below.
    }
  }
  return shareContent({ title: data.title, text: data.text, url: data.url });
}

async function qrImageFile(dataUrl: string | null | undefined, name: string): Promise<File[] | null> {
  if (!dataUrl) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return [new File([blob], name, { type: blob.type || "image/png" })];
  } catch {
    return null;
  }
}
