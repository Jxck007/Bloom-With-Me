---
name: bloom-accessibility-qa
description: Test Bloom With Me for accessible, non-blocking gameplay across touch, keyboard, hand, and voice input; reduced motion; camera and microphone denial; muted sound; mobile and tablet responsiveness; and calm game-state behavior. Use for QA plans, browser tests, accessibility reviews, and release verification in this repository.
---

# Bloom Accessibility QA

## Establish the test matrix

Test the complete game flow at 360x800, 768x1024, and 1366x768 across these conditions:

- Touch only, keyboard only, hand tracking, and voice or sound input.
- Camera allowed, denied, dismissed, unavailable, model-load failure, and no hand visible.
- Microphone allowed, denied, dismissed, unavailable, speech recognition unavailable, silence, ambient noise, and recognized speech.
- Operating-system reduced motion on and off, plus any manual in-app preference.
- Sound muted by default and user-controlled unmute if sound exists.
- Fresh progress, partial saved progress, completed progress, corrupt local storage, reload, and restart.

## Accessibility assertions

- Camera and microphone prompts occur only after explicit, clearly labeled user actions.
- Touch fallback is immediately available at every gesture or voice step; it is never unlocked by waiting.
- Every action is reachable with Tab, has a visible focus indicator, activates with keyboard conventions, and leaves focus in a sensible place after state changes.
- Instructions do not rely only on color, motion, sound, gesture, or artwork.
- Status messages are concise and announced without flooding live regions with frame-level updates.
- Controls and content remain unobscured, readable, and at least 44 by 44 CSS pixels where touched.
- Reduced motion removes perpetual and large movement without hiding progress or feedback.
- Denied or missing sensors never block completion or shame the player.
- The experience contains no timer pressure, lives, penalties, game-over state, or flashing effects.

## Browser and manual testing

- Use deterministic browser tests for keyboard flow, touch fallback, state transitions, saved progress, responsive overflow, reduced-motion emulation, and mocked permission/media failures.
- Inspect console errors, failed requests, layout overflow, focus visibility, and accessible names at each required viewport.
- Treat camera, MediaPipe accuracy, microphone level detection, and vendor speech recognition as hardware/browser-dependent. Mock failure paths automatically, then test successful recognition manually on supported devices.
- Check Chrome or Edge for the primary media path and at least one browser without Web Speech support for fallback behavior.

## Release gate

1. Run `npm run build` after each major phase.
2. Record which matrix cases passed, failed, or were not run.
3. Include reproduction steps and viewport for every failure.
4. Do not claim a feature works based only on compilation, visual inspection, mocks, or a different input path.
