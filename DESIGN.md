# Design System: Dr. Ashwani Family Clinic

## 1. Visual Theme & Atmosphere

Brand kit: [docs/brand/BRANDKIT.md](docs/brand/BRANDKIT.md). Card language inspired by Refero Styles "Botanical greenhouse on cream paper" (Ease Health): settled, flat, tinted rooms.

A calm, premium clinical mobile app with generous spacing, soft structure, and strong readability. The interface should feel like a modern private clinic: safe, focused, practical, and personal. Density is daily-app balanced, variance is lightly asymmetric, and motion is restrained with small tactile feedback.

## 2. Color Palette & Roles

The shared roles live in `src/clinic-theme.css`. Welcome art, clinical forms, chat, lists, and visit tools use the same foreground, surface, and control roles.

| Appearance | Canvas | Card | Raised control | Text | Primary action |
| --- | --- | --- | --- | --- | --- |
| Light | #F6F8F3 | #FFFFFD | #EDF3EC | #172D2A | #176763 |
| Charcoal | #191D1D | #232929 | #2D3634 | #EFF5F2 | #B7DED3 |
| Pine | #14211B | #1D2C24 | #26382E | #EEF7F0 | #ACE1BF |

Muted text and outlines have their own roles. Use the paired foreground for filled actions and keep success, pending payment, and urgent states on their respective green, amber, or rose surfaces with visible labels. Welcome and profile controls share the saved appearance.

## 3. Typography Rules

- **Interface:** [Geist Variable](https://uncut.wtf/sans-serif/geist/) served locally. Use the same family for headings and body text.
- **Scale:** 24px screen titles, 17px section titles, 16px input text, and a 13px caption role. Use relative units.
- **Numbers:** Use tabular numerals for vitals, fees, dates, and counts.
- **Clinical lists:** Use short section titles, predictable grouping, and a clearer divider between navigation and content.

## 4. Component Stylings

- **Buttons:** Rounded, tactile, minimum 48px touch target. Primary buttons use the theme action color and its paired foreground. Secondary buttons use the raised surface and a control outline.
- **Cards (settled):** 14px radius, flat, no border and no shadow. Depth comes from layered fills: paper canvas, card, then tinted rooms (mint for care, sage for highlight, sky for information, amber for waiting, rose for alerts). A room always has a visible label. Use `src/ui/Card.jsx`. No cards inside cards.
- **Buttons in code:** `src/ui/Button.jsx` (Base UI Button + cva). Intents primary, secondary, ghost, danger; 0.97 press; spinner when loading.
- **Eyebrows:** 12px, 620, uppercase, 0.09em tracking, muted (`.clinic-eyebrow`). Tags are pills.
- **Inputs:** Label above input, helper/error below when needed. Focus uses the theme action outline.
- **Chat:** Must look like a conversation: compact context header, scrollable message thread, sender-aligned bubbles, composer pinned to the bottom of the chat panel.
- **Doctor Pages:** Functional, scan-friendly, and quieter than patient pages. Patient detail data must remain readable in light and dark modes.
- **Education Posts:** Use the same post template for doctor publishing and patient reading. Tone color is decorative only, never the main information channel.

## 5. Layout Principles

- Mobile-first only for the phone app shell. Keep all screens within a bounded phone canvas with no horizontal overflow.
- Keep existing app directions: intro, auth, patient home, updates, booking, chat, education, doctor home, patients, availability, and education publishing.
- Preserve all current business logic unless a visual element is broken or redundant.
- Use 18-24px page padding, 12-16px internal gaps, 14px card radius and 12px control radius.
- Avoid decorative clutter. Every visual treatment should support trust, hierarchy, or comprehension.

## 6. Motion & Interaction

- Use 180-300ms transitions with cubic-bezier easing.
- Animate only opacity and transform.
- Respect reduced-motion preferences.
- Active buttons compress subtly; screen transitions should feel gentle, not cinematic.

## 7. Anti-Patterns

- No neon purple or AI gradient look.
- No unreadable dark-mode cards.
- No black text on dark surfaces.
- No oversized cards that waste the chat area.
- No hidden or dead navigation for Education Library or doctor education posting.
- No static demo data pretending to be real clinic data.
- No medical diagnosis or medicine dose changes from the assistant.
