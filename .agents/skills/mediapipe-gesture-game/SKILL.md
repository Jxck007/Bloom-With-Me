---
name: mediapipe-gesture-game
description: Implement and debug MediaPipe hand tracking for Bloom With Me, including explicit camera permission, mirrored preview and landmark overlays, pinch dragging and release, open-palm recognition, wave recognition, lifecycle cleanup, performance, and touch fallback. Use for camera, canvas, gesture-math, or gesture-to-game-state work in this repository.
---

# MediaPipe Gesture Game

## Inspect the complete pipeline

Trace each feature through permission action, media stream, model loading, inference loop, coordinate conversion, temporal gesture state, game transition, UI feedback, and cleanup. Confirm the installed `@mediapipe/tasks-vision` API and current browser requirements before changing code.

## Control permissions and lifecycle

- Start camera access only from an explicit user action. Never mount an enabled hook that calls `getUserMedia` automatically.
- Separate permission, model-loading, ready, denied, unavailable, and stopped states.
- Handle React Strict Mode, quick enable/disable cycles, late async results, video play failure, model-load failure, and unmount.
- Stop every track and close the landmarker on cancellation, including streams obtained after cancellation.
- Avoid recreating the model or stream for each game step when one user-approved session can be reused safely.

## Keep inference responsive

- Process a video frame once, skip duplicate timestamps, and cap inference frequency when needed.
- Keep frame-by-frame landmarks, histories, and smoothed scores in refs or imperative drawing paths. Publish only meaningful UI state changes to React.
- Size canvas backing pixels for device pixel ratio without reallocating on every frame.
- Prefer a same-origin pinned MediaPipe runtime/model for dependable deployment when feasible; otherwise surface network-loading failure clearly.

## Use one coordinate contract

- Decide whether mirroring occurs in CSS or coordinate math and document it beside the transform.
- If the video is mirrored with `scaleX(-1)` and the canvas is not, draw each landmark at `(1 - x) * width`; use the same mirrored x for the cursor and hit testing.
- Convert normalized camera coordinates into the actual interactive stage rectangle before drag/drop checks. Account for `object-fit: cover` crop and letterboxing.
- Verify alignment at all required viewport sizes with the left and right edges of the hand, not only the center.

## Recognize deliberate gestures

- Normalize distance thresholds to palm size and reject incomplete landmark sets.
- Model pinch as a state machine: pinch start acquires the intended seed, pinch move drags it, and pinch release over the pot plants it. A pinch anywhere must not complete planting.
- Require a stable open palm with extended fingers and a non-pinching hand for a short duration; reset stability when visibility is lost.
- Detect a wave from time-windowed, open-palm horizontal motion with meaningful displacement and direction changes. Make thresholds time-based rather than frame-count-based.
- Scope gesture acceptance to the current step and use hysteresis/cooldown to prevent repeated transitions.

## Verify honestly

1. Unit-test gesture math with synthetic landmark and wrist histories, including borderline and low-frame-rate cases.
2. Browser-test permission denial, camera absence, model failure, touch fallback, resize, and cleanup.
3. Manually test real hands under varied lighting, distance, handedness, and frame rate.
4. Confirm video, skeleton, cursor, and drag target alignment at 360x800, 768x1024, and 1366x768.
5. Run `npm run build`; do not claim hardware recognition works without real-device testing.
