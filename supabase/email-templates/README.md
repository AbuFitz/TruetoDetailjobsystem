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
