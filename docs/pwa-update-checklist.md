# PWA update verification

1. Deploy commit A and open the installed iPhone app. Confirm More shows its short build ID.
2. Deploy commit B with a different commit SHA.
3. Reopen the installed app or bring it back to the foreground. Confirm an “Update available” toast appears.
4. Tap “Reload”. Confirm the app reloads once and More shows commit B’s build ID.
5. Log a visit before updating, complete the update, and confirm the visit remains. The update flow must never clear IndexedDB.
6. In DevTools/Application, verify `/sw.js` and `/manifest.webmanifest` use `Cache-Control: public, max-age=0, must-revalidate`.
