// Thin wrapper around the `qrcode` (encode) and `jsqr` (decode) libraries —
// per decision D18, components ask for a data URL / decoded string rather
// than touching a canvas/QR API directly. Swap-point if a native
// scanner/renderer plugin replaces this.
import QRCode from "qrcode";
import jsQR from "jsqr";

/** Renders `text` as a PNG data URL — black modules on a white background
 *  (kept independent of the app's dark/light theme so it always scans). */
export async function generateQrDataUrl(text: string, size = 240): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: "#0A0A0B", light: "#FFFFFF" },
  });
}

/** Decodes a QR code from raw pixel data (e.g. a camera frame from
 *  `cameraService.captureVideoFrame`). Returns null if no QR code is found
 *  in the frame — callers keep scanning rather than treating it as an error. */
export function decodeQrFromImageData(imageData: ImageData): string | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result?.data ?? null;
}

/** Decodes a QR code from an uploaded image file (the gallery-picker path). */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decodeQrFromImageData(imageData);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load that image."));
    img.src = src;
  });
}
