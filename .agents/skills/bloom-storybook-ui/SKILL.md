---
name: bloom-storybook-ui
description: Review and implement Bloom With Me's calm, feminine, accessible storybook game interface. Use for React/TypeScript UI, layout, styling, supplied-artwork integration, responsive behavior, child-friendly game feedback, and interaction-state work in this repository.
---

# Bloom Storybook UI

## Start with the source of truth

1. Inspect the current screen flow, styling, and existing behavior before editing.
2. Read `public/assets/asset-map.json` and `public/assets/README.md` before changing visuals.
3. Use the supplied artwork for flowers, seeds, packets, pots, weather, gestures, cursor, and UI controls. Never substitute CSS drawings, text glyphs, or emoji.
4. Preserve working hand, voice, touch, keyboard, and progress behavior unless a verified bug requires a focused change.

## Design the experience

- Read the product as a calm, feminine storybook garden game: warm, gentle, spacious, reassuring, and never competitive.
- Make hand and voice the primary story controls while keeping touch visible, immediate, and friendly at every interactive step.
- Request camera and microphone only from clear user-initiated controls. Explain why access helps and keep denial non-blocking.
- Keep sound muted by default and make its state unambiguous.
- Do not add timers, lives, score penalties, game-over screens, flashing effects, or urgency language.
- Use progress as quiet orientation, not performance judgment.

## Build accessible UI

- Use semantic landmarks and real buttons. Give artwork useful alt text only when it communicates content; hide decorative art.
- Maintain visible keyboard focus, logical focus order, clear pressed/disabled states, and touch targets of at least 44 by 44 CSS pixels.
- Keep instructions short and pair gesture-only meaning with text and supplied illustrations.
- Use polite live announcements for meaningful state changes; do not announce continuous camera or microphone measurements.
- Honor `prefers-reduced-motion` by default and any in-app override. Replace large or perpetual motion with simple state changes.
- Preserve text contrast and legibility over illustrated backgrounds.

## Make layouts resilient

- Design mobile-first without cropping essential art or placing fixed controls over instructions.
- Explicitly verify the complete flow at 360x800, 768x1024, and 1366x768.
- Keep the stage, camera preview, instruction panel, and fallback controls usable in portrait and landscape layouts.
- Prefer responsive CSS and small focused components over viewport-specific duplication.

## Validate before reporting success

1. Run `npm run build` after each major implementation phase.
2. Exercise every screen with touch and keyboard.
3. Test permission granted, denied, unavailable, and dismissed states.
4. Check the three required viewports and reduced motion.
5. Report untested hardware-dependent behavior explicitly; never infer that it works from a successful build.
