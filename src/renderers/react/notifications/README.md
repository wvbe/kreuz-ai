# notifications

Turns engine events into toasts (spec 024 FR-028, FR-036, FR-040).

- `NotificationCenter.ts` - the rules: tier and milestone toasts, Major moments, housing and Steward tidings folded over `toastBurstLimit` per game hour, `status.blocked` grouped per reason and hour, per-reason mutes.
- `NotificationBridge.tsx` - subscribes the center to the session's events; `ToastHost` mounts it. Also builds the click actions (focus the subject, open the chronicle or the progress panel).
- `ToastSettings.tsx` - the per-reason switches shown on the Settings screen.
