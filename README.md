# Bloom With Me

Bloom With Me is a calm, accessible children’s storybook garden game. Players choose a supplied seed packet, plant it with a hand pinch or pointer drag, bring sunlight and rain with gestures or touch, and help the flower grow with a word, a sustained vocal sound, or a tap.

The experience is non-competitive: there are no timers, lives, penalties, scores, flashing effects, or game-over screens. Sound is muted by default, and touch controls remain available throughout the game.

## Main features

- Three repeatable flower paths: rose, sunflower, and lavender
- Supplied storybook garden, seed, pot, weather, gesture, cursor, icon, and flower artwork
- Explicit, user-initiated camera and microphone controls
- MediaPipe hand landmarks with pinch, open-palm, and wave interactions
- Mouse, touchscreen, pen, and keyboard-friendly alternatives
- English and Tamil growth-word recognition where Web Speech is available
- Calibrated sustained-vocal-sound fallback using browser audio levels
- Muted-by-default procedural game audio
- Reduced-motion support and responsive layouts
- Local progress restoration with safe validation of stored data

## Technology stack

- React 19
- TypeScript
- Vite
- MediaPipe Tasks Vision
- Web Speech API when available
- Web Audio API
- Node’s built-in test runner

## Requirements

- Node.js 22.12 or newer
- npm
- A modern browser
- HTTPS in production for camera and microphone access

## Installation

```bash
git clone <repository-url>
cd bloom-with-me-recognition-debug
npm install
```

## Development

```bash
npm run dev
```

Open the local URL printed by Vite. Camera and microphone permissions are requested only after their corresponding controls are activated.

## Tests

```bash
npm test
```

The focused test suite covers game transitions, gesture thresholds and cooldowns, seed drops, bilingual voice terms, vocal-sound gating, storage validation, and permission classification.

## Production build

```bash
npm run build
```

Vite writes the production application to `dist/`. To inspect that build locally:

```bash
npm run preview
```

## Camera and microphone permissions

The camera starts only after **Enable Camera** is pressed. The microphone starts only after **Tap the microphone** is pressed during the grow step. Denial, unavailable hardware, or unsupported APIs never block the game; retry and touch controls remain available.

Camera and microphone APIs require a secure context. `localhost` is permitted during local development, while deployed sites must use HTTPS.

## Touch-only fallback

The complete game can be played without camera or microphone access:

1. Drag a seed packet to the pot.
2. Tap the sun.
3. Tap the cloud.
4. Tap **Tap to Grow**.
5. Add the flower to the garden and repeat.

Keyboard activation is also supported for the seed packets and stage controls.

## Supported browsers

- Current Chrome and Edge provide the most complete camera, MediaPipe, Web Speech, and Web Audio experience.
- Current Safari supports the touch path, camera, microphone, and Web Audio; speech-recognition availability and behavior vary by operating-system version.
- Current Firefox supports the touch path, camera, microphone, and Web Audio, but generally does not provide `SpeechRecognition`. Sustained sound and touch remain available.

Older browsers without `navigator.mediaDevices`, Web Audio, or modern JavaScript module support should use the touch-only path where the application can load.

## Known browser limitations

- Web Speech recognition is vendor-controlled and may be unavailable, require network access, or produce different transcripts across browsers and accents.
- MediaPipe performance and GPU delegation vary by device, browser, lighting, and thermal conditions.
- Camera and microphone permission behavior is controlled by the browser and operating system.
- The easy voice mode responds to sustained sound level, not linguistic meaning, and may require recalibration in changing background noise.

## Vercel deployment

The repository includes `vercel.json` with:

- Build command: `npm run build`
- Output directory: `dist`

No environment variables, secrets, backend service, or database are required. The game uses a single Vite entry route, so no SPA rewrite is necessary. Vercel supplies HTTPS automatically.

Deploy from the Vercel dashboard by importing the Git repository and accepting the detected settings, or deploy with the CLI:

```bash
npm install --global vercel
vercel
vercel --prod
```

## Asset structure

`public/assets/asset-map.json` is the source of truth for runtime artwork paths.

```text
public/assets/
├── backgrounds/
├── flowers/
│   ├── lavender/
│   ├── rose/
│   └── sunflower/
├── gestures/
├── pots/
├── seeds/
├── ui/
├── weather/
└── asset-map.json
```

Assets under `public/` are served from root-relative `/assets/...` URLs in development and production.

## Privacy

Camera frames are processed in the browser by MediaPipe for hand landmarks. The application does not record or upload camera video. Easy voice mode measures microphone signal level in the browser and does not record or store audio.

When browser-provided speech recognition is used, audio handling may involve the browser vendor’s recognition service under that browser’s privacy terms. Bloom With Me stores only completed flower identifiers in local storage; it has no application backend and does not require an account.

## Manual test checklist

- [ ] Start with sound muted and confirm no automatic camera, microphone, or audio playback.
- [ ] Complete one flower using mouse or touchscreen only.
- [ ] Complete seed selection and stage controls with the keyboard.
- [ ] Deny camera permission, confirm retry, and continue with touch.
- [ ] Deny microphone permission and complete growth with **Tap to Grow**.
- [ ] On a supported browser, verify speech and sustained-sound growth independently.
- [ ] Confirm camera and microphone tracks stop when disabled or after leaving their stage.
- [ ] Verify reduced motion through both operating-system preference and the in-game control.
- [ ] Reload after one saved flower and confirm progress restoration.
- [ ] Reset a completed garden and confirm saved completion data is removed.
- [ ] Check 360×800, 390×844, 768×1024, 1024×768, 1366×768, and 1920×1080 layouts.
- [ ] Verify the deployed HTTPS URL can request camera and microphone permissions.
