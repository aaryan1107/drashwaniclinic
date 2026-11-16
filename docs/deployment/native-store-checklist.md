# Native Store Release Checklist

This project is currently a Vite React web app. The configured native route is a Capacitor wrapper around the production `dist` build.

## One-Time Local Setup

1. Install native wrapper packages:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
   ```
2. Generate native projects:
   ```bash
   npx cap add android
   npx cap add ios
   npm run native:sync
   ```
3. Confirm app identifiers:
   - Android package: `com.drashwani.familyclinic`
   - iOS bundle id: `com.drashwani.familyclinic`
4. Add real PNG app icons and splash assets in Android Studio and Xcode. The current web `public/icon.svg` is fine for PWA but not enough for final store art.

## Supabase Auth Redirects

Add these redirect URLs in Supabase Auth settings:

```text
http://localhost:5288
http://localhost:5288/
https://your-production-domain.example
https://your-production-domain.example/
com.drashwani.familyclinic://auth/callback
```

Follow the Google provider setup in [Firebase Hosting Setup](firebase-hosting.md). The native browser returns to the app via the callback above. Run `npm run native:sync` before building either platform and verify sign-in from both a cold launch and an already-open app.

## Google Play

1. Create the app in Google Play Console.
2. Build a signed Android App Bundle from Android Studio after `npm run native:sync`.
3. Configure Play App Signing.
4. Complete Data Safety:
   - Health information: collected.
   - Personal information: name, email, phone.
   - Financial information: payment transaction metadata through Razorpay.
   - Data is used for appointments, follow-up, doctor review, payments.
5. Add privacy policy URL before review.
6. Start with Internal testing, then Closed testing, then Production.

## iOS App Store

1. Create the app in App Store Connect with bundle id `com.drashwani.familyclinic`.
2. Open iOS project with `npm run native:ios`.
3. Configure signing in Xcode.
4. Archive and upload to TestFlight.
5. Complete App Privacy:
   - Contact info.
   - Health and fitness data.
   - Payment metadata.
   - Diagnostics if analytics/crash tooling is added later.
6. Add privacy policy URL and medical disclaimer in review notes.

## Medical/Payments Review Notes

Use review notes similar to:

```text
This app supports clinic appointment requests, patient-entered readings, doctor review, education posts, and Razorpay consultation fee collection. The app does not provide emergency care, autonomous diagnosis, or medicine dose changes. Doctor review is required for personal medical advice.
```

