# Firebase Hosting Setup

This app uses Firebase Hosting for deployment and Supabase for auth, database, Razorpay Edge Functions, readings, availability, and education posts.

## Project

- Firebase project ID: `dr-ashwani-metabolic-care`
- Hosting public directory: `dist`
- SPA fallback: all routes rewrite to `/index.html`

## First-Time Terminal Setup

```bash
cd /Users/AaryanKansal1/Desktop/Projects/Clinic
npx firebase-tools login
npx firebase-tools use --project dr-ashwani-metabolic-care
```

## Preview Deploy

```bash
npm run firebase:preview
```

## Production Deploy

```bash
npm run firebase:deploy
```

## Supabase Auth Redirect URLs To Add

Add these in Supabase Dashboard > Authentication > URL Configuration:

```text
https://dr-ashwani-metabolic-care.web.app/
https://dr-ashwani-metabolic-care.firebaseapp.com/
```

Keep existing local/native URLs too:

```text
http://localhost:5173/
http://127.0.0.1:5173/
com.drashwani.familyclinic://auth/callback
```

## Google OAuth Console

In Google Cloud Console > APIs & Services > Credentials > OAuth Client:

Authorized JavaScript origins:

```text
https://dr-ashwani-metabolic-care.web.app
https://dr-ashwani-metabolic-care.firebaseapp.com
http://localhost:5173
http://127.0.0.1:5173
```

Authorized redirect URI for Supabase OAuth:

```text
https://aswxzeklbabtflgmjszz.supabase.co/auth/v1/callback
```

Do not use Firebase Auth redirect handlers unless the app is intentionally migrated from Supabase Auth to Firebase Auth.

## Enable Google in Supabase

1. Create or select a Google OAuth client of type **Web application**. Put the Supabase callback above in Google’s authorized redirect URIs.
2. Enable the Google provider under Supabase **Authentication → Sign In / Providers → Google**, then enter the client ID and secret there. Store the secret only in Supabase.
3. Set the Supabase Site URL to the deployed HTTPS web origin and allowlist the exact web and native redirects above. Use the actual Hosting URL if it differs from the documented project.
4. Test a new patient, a returning patient, an approved doctor, and an unapproved account using the doctor sign-in button. Test Android and iOS after syncing and rebuilding. The native app opens the system browser and exchanges the returned authorization code using PKCE.
