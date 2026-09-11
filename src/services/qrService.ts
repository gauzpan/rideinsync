// Thin wrapper around the `qrcode` rendering library — per decision D18,
// components ask for a data URL rather than touching a canvas/QR API
// directly. Swap-point if a native scanner/renderer plugin replaces this.
import QRCode from "qrcode";

/** Renders `text` as a PNG data URL — black modules on a white background
 *  (kept independent of the app's dark/light theme so it always scans). */
export async function generateQrDataUrl(text: string, size = 240): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: "#0A0A0B", light: "#FFFFFF" },
  });
}
