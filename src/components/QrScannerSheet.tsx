import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { captureVideoFrame, pickImageFile, startCamera, stopCamera } from "../services/cameraService";
import { decodeQrFromFile, decodeQrFromImageData } from "../services/qrService";

type Props = {
  /** Called with the raw decoded QR text — the caller (JoinRidePage) turns
   *  it into a join code via `onboardingService.extractJoinCode`. */
  onDecode: (text: string) => void;
  onClose: () => void;
};

/**
 * In-app QR scanner: a live camera preview that decodes frames as they
 * arrive, plus a "choose from gallery" fallback that decodes a picked image.
 * Both paths go through the camera/QR service wrappers per decision D18 —
 * this component never touches `getUserMedia` or the decode library itself.
 */
export function QrScannerSheet({ onDecode, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const decodedRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function scanLoop() {
      rafRef.current = requestAnimationFrame(() => {
        if (decodedRef.current || cancelled) return;
        const video = videoRef.current;
        const frame = video ? captureVideoFrame(video) : null;
        const text = frame ? decodeQrFromImageData(frame) : null;
        if (text) {
          decodedRef.current = true;
          onDecode(text);
          return;
        }
        scanLoop();
      });
    }

    startCamera()
      .then((stream) => {
        if (cancelled) {
          stopCamera(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        scanLoop();
      })
      .catch((e) => {
        if (!cancelled) setCameraError(e instanceof Error ? e.message : "Couldn't open the camera.");
      });

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopCamera(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGalleryPick() {
    setUploadError(null);
    setUploading(true);
    try {
      const file = await pickImageFile();
      if (!file) return;
      const text = await decodeQrFromFile(file);
      if (!text) {
        setUploadError("Couldn't find a QR code in that image.");
        return;
      }
      decodedRef.current = true;
      onDecode(text);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Couldn't read that image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan QR to join"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--color-bg-base)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-md) var(--gutter)",
        }}
      >
        <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
          Scan QR to join
        </span>
        <IconButton name="x" onClick={onClose} aria-label="Close scanner" />
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#000" }}>
        {cameraError ? (
          <div style={{ padding: "var(--space-lg)" }}>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>{cameraError}</p>
            <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption)", marginTop: "var(--space-sm)" }}>
              You can still join by uploading a QR image below, or go back and type the code.
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {!cameraError && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "18%",
              border: "2px solid var(--color-accent)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 0 0 999px rgba(0, 0, 0, 0.4)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      <div
        style={{
          padding: "var(--space-lg) var(--gutter) calc(var(--space-2xl) + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        {uploadError && (
          <p style={{ color: "var(--color-role-sweep)", fontSize: "var(--text-label)", margin: 0 }}>{uploadError}</p>
        )}
        <Button variant="secondary" onClick={() => void handleGalleryPick()} loading={uploading}>
          Choose QR image from gallery
        </Button>
      </div>
    </div>
  );
}
