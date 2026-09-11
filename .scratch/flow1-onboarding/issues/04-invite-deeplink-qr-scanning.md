# 04: Invite link deep-link + QR scanning (all three paths)

**What to build:** Riders can join not only by typing the code but by tapping the invite link or scanning the QR — native camera, in-app scanner, and gallery image.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] Tapping the invite link opens the app at a `/join/:code` route, captures the code, and routes to sign-in (if needed) → ride preview → join.
- [ ] The join code survives the Google OAuth redirect round-trip (stashed and restored on return); guest sign-in needs no round-trip.
- [ ] QR native-camera path: the QR encodes the join URL so the phone's own camera opens it into the join flow (no in-app code needed beyond generating the QR).
- [ ] QR in-app scanner: a "scan QR" action opens the camera via `getUserMedia` and decodes a QR to a join code (using a QR-decode library), then joins.
- [ ] QR gallery upload: the user can pick a QR image from the gallery and it is decoded to a join code.
- [ ] Camera/scanning is accessed through the camera service-module wrapper (per decision D18).
- [ ] `npm run build` succeeds; changes reviewed and committed.
