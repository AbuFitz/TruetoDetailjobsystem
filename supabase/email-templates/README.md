# Supabase auth email templates

Paste these into the Supabase dashboard (Authentication, then Email Templates). They are built from the
same layout as every booking email the website sends (one column, no boxes inside boxes, full width
text on a phone), and they keep the `{{ .ConfirmationURL }}`
link Supabase fills in.

| Template in Supabase | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your True To Detail account |
| Reset password | `reset-password.html` | Reset your True To Detail password |

The templates live in Supabase, not in this app, so a change here does nothing until it is pasted in.

## Reset password link style

`reset-password.html` links to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` instead of
`{{ .ConfirmationURL }}`. The app redeems that token itself (`/account/reset`), so the link works when it
is opened on a different device or browser than the one that asked for it, and an email scanner that only
fetches the page cannot use it up. The default link needs the original browser, and fails everywhere else.
Paste the updated template into Supabase for this to take effect. Until then the page explains the
failure instead of calling it expired.
