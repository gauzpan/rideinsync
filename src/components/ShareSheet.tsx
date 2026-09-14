import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { IconButton } from "./ui/IconButton";
import {
  downloadShareCard,
  renderShareCard,
  shareToFacebook,
  shareToInstagram,
  shareToX,
  type ShareCardData,
} from "../lib/shareCard";

type Props = {
  data: Omit<ShareCardData, "customImageDataUrl">;
  onClose: () => void;
  onStatus: (msg: string) => void;
};

/** Bottom sheet shown after a ride ends — previews the branded share card
 *  (own stats, RideInSync logo, optional custom photo background) and offers
 *  per-platform handles plus a plain image download as the catch-all. */
export function ShareSheet({ data, onClose, onStatus }: Props) {
  const [customImage, setCustomImage] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    renderShareCard({ ...data, customImageDataUrl: customImage }).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customImage]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handle(action: () => Promise<unknown> | void, label: string) {
    setBusy(true);
    try {
      await action();
      if (label) onStatus(label);
    } catch (e) {
      onStatus(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const cardData: ShareCardData = { ...data, customImageDataUrl: customImage };

  const handles: { name: "brand-instagram" | "brand-x" | "brand-facebook"; label: string; onClick: () => void }[] = [
    {
      name: "brand-instagram",
      label: "Instagram",
      onClick: () =>
        handle(async () => {
          const res = await shareToInstagram(cardData);
          onStatus(
            res === "shared"
              ? "Opened share sheet."
              : res === "app-opened"
                ? "Card downloaded — opening Instagram, attach it from your gallery."
                : "Card downloaded — opening instagram.com, attach it there."
          );
        }, ""),
    },
    { name: "brand-x", label: "X", onClick: () => handle(() => shareToX(cardData), "Opened X.") },
    {
      name: "brand-facebook",
      label: "Facebook",
      onClick: () => handle(() => shareToFacebook(cardData), "Opened Facebook."),
    },
  ];

  // Portalled to <body> so this full-screen overlay escapes the page content
  // wrapper's own stacking context (AppLayout gives it z-index:1) — nested
  // z-index alone can't out-rank the fixed TabBar/BottomNav otherwise, which
  // left the sheet's bottom controls hidden behind the nav icons.
  return createPortal(
    <div
      role="dialog"
      aria-label="Share this ride"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "min(88vh, 720px)",
          overflowY: "auto",
          background: "var(--color-surface-1)",
          borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-lg) var(--gutter) calc(var(--space-lg) + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-md)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "var(--text-h2)", margin: 0 }}>Share this ride</h2>
          <IconButton name="x" size={40} iconSize={18} onClick={onClose} aria-label="Close" />
        </div>

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Ride share card preview"
            style={{
              width: 200,
              height: 200,
              alignSelf: "center",
              objectFit: "cover",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-raised)",
            }}
          />
        )}

        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{ gap: "var(--space-xs)" }}
        >
          <Icon name="plus" size={18} />
          {customImage ? "Change custom image" : "Add custom image"}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />

        <Card padding="var(--space-md)">
          <div style={{ display: "flex", justifyContent: "space-around", gap: "var(--space-sm)" }}>
            {handles.map((h) => (
              <div
                key={h.name}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2xs)" }}
              >
                <IconButton
                  name={h.name}
                  size={56}
                  iconSize={26}
                  disabled={busy}
                  aria-label={`Share to ${h.label}`}
                  onClick={h.onClick}
                />
                <span style={{ fontSize: "var(--text-label)", color: "var(--color-text-secondary)" }}>
                  {h.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Button
          onClick={() => handle(() => downloadShareCard(cardData), "Card downloaded.")}
          loading={busy}
          style={{ gap: "var(--space-xs)" }}
        >
          <Icon name="download" size={18} />
          Download image
        </Button>
      </div>
    </div>,
    document.body
  );
}
