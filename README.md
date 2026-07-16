# Bloom With Me — Recognition Debug Build

## Run
```bash
npm install
npm run dev
```
Open the local URL in Chrome or Edge and allow camera/microphone access.

## Included
- Live mirrored camera preview
- 21-point MediaPipe hand skeleton overlay
- Hand-visible / no-hand indicator
- Current gesture label and match percentage
- Hand-size-normalized pinch and palm detection
- Wave tracking using wrist direction changes
- GPU inference with automatic CPU fallback
- Live microphone level meter and recognised transcript
- Voice keywords: Grow, Go, Bloom, Flower, plus Tamil வளர் / மலர்
- Easy voice fallback: sustained clear vocal sound
- Touch rescue button at every step

## Best recognition conditions
- Keep one hand fully inside the camera frame
- Use even front lighting
- Keep the palm roughly 40–100 cm from the camera
- Avoid a very busy background
- For wave: show an open palm and move it left-right-left

## Deployment
Build command: `npm run build`
Output directory: `dist`
Camera and microphone require HTTPS in production; Vercel provides HTTPS automatically.

## Important
Browser speech recognition works best in Chrome/Edge. The sound-level fallback remains available when word recognition is unsupported. Camera and microphone input stays in the browser except that browser speech recognition may use the browser vendor's recognition service.
# Bloom-With-Me
