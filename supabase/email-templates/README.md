# Supabase auth email templates

Paste these into the Supabase dashboard (Authentication, then Email Templates). They are the same
minimal, single column design as the booking emails, and they keep the `{{ .ConfirmationURL }}`
link Supabase fills in.

| Template in Supabase | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your True To Detail account |
| Reset password | `reset-password.html` | Reset your True To Detail password |

The templates live in Supabase, not in this app, so a change here does nothing until it is pasted in.
