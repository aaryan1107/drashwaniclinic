# Design System: Dr. Ashwani Family Clinic

## 1. Visual Theme & Atmosphere

A calm, premium clinical mobile app with generous spacing, soft structure, and strong readability. The interface should feel like a modern private clinic: safe, focused, practical, and personal. Density is daily-app balanced, variance is lightly asymmetric, and motion is restrained with small tactile feedback.

## 2. Color Palette & Roles

- **Clinic Canvas** (#F3F7FC) - Primary app background.
- **Pure Surface** (#FFFFFF) - Cards, forms, and high-priority panels.
- **Charcoal Ink** (#102033) - Primary readable text.
- **Slate Copy** (#64748B) - Secondary text, metadata, helper copy.
- **Mist Border** (#D8E4F2) - Inputs, dividers, and low-contrast boundaries.
- **Clinical Blue** (#1F6FEB) - Single product accent for primary actions, active navigation, focus rings.
- **Care Green** (#0F9F7A) - Semantic success and live availability only.
- **Amber Risk** (#D97706) - Warnings and payment pending states only.
- **Emergency Rose** (#DC2626) - Emergency and high-risk health states only.
- **Night Canvas** (#07111F) - Dark-mode background, never pure black.

## 3. Typography Rules

- **Display:** Outfit, with system fallback. Use confident weight, tight line-height, and balanced wrapping.
- **Body:** Outfit, readable line-height, never wider than the mobile content container.
- **Numbers:** Use tabular numerals for vitals, fees, dates, and counts.
- **Banned:** Inter as the primary brand font, generic serif fonts, oversized hero type inside compact panels, and negative letter spacing.

## 4. Component Stylings

- **Buttons:** Rounded, tactile, minimum 48px touch target. Primary buttons use Clinical Blue. Secondary buttons use white or transparent surfaces with structural borders.
- **Cards:** Use soft rounded rectangles for true grouped content only. Avoid cards inside cards. Shadows must be tinted blue-gray, not black.
- **Inputs:** Label above input, helper/error below when needed. Focus ring uses Clinical Blue.
- **Chat:** Must look like a conversation: compact context header, scrollable message thread, sender-aligned bubbles, composer pinned to the bottom of the chat panel.
- **Doctor Pages:** Functional, scan-friendly, and quieter than patient pages. Patient detail data must remain readable in light and dark modes.
- **Education Posts:** Use the same post template for doctor publishing and patient reading. Tone color is decorative only, never the main information channel.

## 5. Layout Principles

- Mobile-first only for the phone app shell. Keep all screens within a bounded phone canvas with no horizontal overflow.
- Keep existing app directions: intro, auth, patient home, updates, booking, chat, education, doctor home, patients, availability, and education publishing.
- Preserve all current business logic unless a visual element is broken or redundant.
- Use 18-24px page padding, 12-16px internal gaps, and 20-28px card radii.
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
