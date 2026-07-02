# Supabase Auth Email Setup

This project already sends sign-up confirmations to:

`/auth/callback`

That route exchanges the Supabase auth code for a session, creates the `public.users` row if needed, and sends new users to `/onboarding`.

## Production URL values

For the current deployment, use:

- App base URL: `https://portal.romega-solutions.com`
- Auth callback URL: `https://portal.romega-solutions.com/auth/callback`
- Example protected app page: `https://portal.romega-solutions.com/attendance`

## Supabase Dashboard settings

Go to:

`Supabase Dashboard -> Authentication -> URL Configuration`

Set these values:

1. `Site URL`

```text
https://portal.romega-solutions.com
```

2. `Redirect URLs`

Add at least these:

```text
https://portal.romega-solutions.com/auth/callback
http://localhost:3000/auth/callback
```

If you use Vercel preview deployments and want auth links to work there too, add each preview callback URL you actually use.

## Why these URLs matter

- `Site URL` is the default base used by Supabase in email flows.
- `Redirect URLs` is the allowlist. If `/auth/callback` is not listed, confirmation can fail or redirect incorrectly.
- The app signs users up with:

```ts
emailRedirectTo: `${window.location.origin}/auth/callback`
```

That means:

- local sign-up sends users to `http://localhost:3000/auth/callback`
- production sign-up sends users to `https://portal.romega-solutions.com/auth/callback`

Both must be valid in Supabase.

## App env value

In production, your app env should also match the deployed domain:

```env
NEXT_PUBLIC_BASE_URL=https://portal.romega-solutions.com
```

This is used for app metadata and should stay aligned with the real deployment URL.

## Supabase email template

Go to:

`Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup`

Use the HTML in:

[`docs/supabase-confirm-signup-email.html`](./supabase-confirm-signup-email.html)

Important placeholder:

- Keep `{{ .ConfirmationURL }}` exactly as-is. Supabase replaces it with the real confirmation link.

## Suggested email subject

```text
Confirm your RS Ticketing System account
```

## Expected user flow

1. User creates an account on `/login`.
2. Supabase sends the confirmation email.
3. User clicks the button in the email.
4. Supabase redirects to `/auth/callback`.
5. The app creates or syncs the user row.
6. New users land on `/onboarding`.
7. Returning users continue into the app.

## Quick verification

After saving the Supabase settings and template:

1. Sign up with a fresh email.
2. Open the confirmation email.
3. Confirm the CTA points to Supabase first, then returns to `/auth/callback`.
4. Click it and verify you land on `/onboarding` for a new account.
5. Confirm the user row appears in `public.users`.

## Common mistakes

- `Site URL` includes `/auth/callback`
  Use only the base domain there.
- `Redirect URLs` does not include the callback path
  Add the exact callback URL.
- Vercel domain changed but Supabase still points to the old one
  Update both `Site URL` and the allowlist.
- Template button does not use `{{ .ConfirmationURL }}`
  The email will render but the confirmation flow will break.
