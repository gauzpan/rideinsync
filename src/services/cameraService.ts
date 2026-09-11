// Thin wrapper around camera/gallery browser APIs (getUserMedia, canvas frame
// capture, the file picker) — per decision D18, components never touch these
// directly. Swap-point for a future Capacitor Camera plugin.

/** Opens the device camera (back camera preferred) for QR scanning. Throws if
 *  the browser has no camera API or the user denies permission. */
export async function startCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access isn't supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
}

/** Stops every track on a camera stream — call on unmount/close so the
 *  camera indicator turns off. */
export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Grabs the current video frame as pixel data, for QR decoding. Returns
 *  null until the video has real dimensions (e.g. still loading metadata). */
export function captureVideoFrame(video: HTMLVideoElement): ImageData | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Opens the native file/gallery picker and resolves with the chosen image
 *  (or null if the user cancels). No `capture` attribute, so mobile browsers
 *  offer both "camera" and "gallery" in the native chooser. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
    };
    // No reliable "cancel" event across browsers — resolve on window focus
    // return if change never fired.
    let settled = false;
    input.addEventListener("change", () => {
      settled = true;
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(null);
          }
        }, 300);
      },
      { once: true }
    );
    input.click();
  });
}
