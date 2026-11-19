# Dr. Ashwani Family Clinic Design System

## Product Context

Mobile-first clinic app for Dr. Ashwani Kansal. The app has patient and doctor roles, live clinic availability, patient vitals, booking, Razorpay consultation payment, WhatsApp coordination, education posts, and an AI clinic assistant. The UI should feel trustworthy, calm, medical, and premium without becoming a generic wellness landing page.

## Visual Direction

- Primary mood: polished clinical care, modern family physician, diabetes/metabolic follow-up, safe and appointment-ready.
- Mobile app first: every screen should feel like a real native app, with dense but breathable controls.
- Avoid web landing-page composition. Use app cards, bottom navigation, compact action rows, clear forms, and strong screen hierarchy.
- Use doctor/photo assets as warm trust cues, but keep operational screens clean.

## Color Tokens

Source of truth: `src/clinic-theme.css` + `src/clinic-brand.css`; brand kit in `docs/brand/BRANDKIT.md`.

- Clinic teal (action, logo tile): `#176763` (hover `#165C57`)
- Ink: `#172D2A`, muted: `#4C6660`
- Paper canvas: `#F6F8F3`, card: `#FFFFFD`, raised control: `#EDF3EC`, hairline: `#E1E8E1`, control outline: `#809A92`
- Rooms: mint `#E1F4DF`, sage `#CFE7D3`, sky `#DDE9EC`, amber `#F7EED9` (text `#84530C`), rose `#FBE8EC` (text `#A1243A`)
- Logo bars: patient `#E0F0EC`, doctor `#9FDCC0`
- Dark themes: Charcoal (canvas `#191D1D`, card `#232929`, action `#B7DED3`) and Pine (canvas `#14211B`, card `#1D2C24`, action `#ACE1BF`)

## Shape And Type

- Geist Variable only. Titles 24px/680, sections 17px, body 16px, captions 13px, eyebrows 12px uppercase 0.09em.
- Settled cards: 14px radius, flat, no border, no shadow; depth from fills. Buttons 12px radius, 52px primary. Tags are pills.

## Components And Patterns

- Phone shell with native status-bar feel.
- First screen: doctor-led welcome with cutout portrait and one strong booking/login action.
- Auth: segmented patient/doctor + sign-in/sign-up, Google button, email/phone field, password, forgot-password OTP panel.
- Patient home: live availability card, vitals grid, appointment card, compact quick actions.
- Chat: conversational message bubbles, quick prompt chips, sticky composer, emergency escalation banner, semantic AI status.
- Doctor: denser records, patient detail cards, editable vitals/notes/Rx/follow-up sections.

## UI Quality Bar

- 48px touch targets.
- Dark mode contrast must keep text legible on colored cards.
- Cards max radius around 20-28px in app surfaces; avoid nested-card clutter.
- Use icons for actions and labels, not decorative filler.
- Text must never overflow buttons or pills.
- Emergency states must be unmistakable, not decorative.
