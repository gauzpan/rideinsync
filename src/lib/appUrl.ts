// Canonical public origin for shareable links (ride/group invite URLs, QR
// codes, share cards).
//
// VITE_APP_URL pins the production hosted URL at build time, so a link
// generated anywhere (dev phone, preview build, native share sheet) still
// opens the live app. When unset — local dev — it falls back to
// window.location.origin, which is exactly right there.
export function appOrigin(): string {
  const configured = import.meta.env.VITE_APP_URL?.trim().replace(/\/+$/, "");
  return configured || window.location.origin;
}
