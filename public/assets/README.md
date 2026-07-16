# Bloom With Me — Ready Asset Pack

Copy the contents of this folder into your Vite project:

    public/assets/

Recommended final structure:

    public/assets/backgrounds/
    public/assets/weather/
    public/assets/seeds/
    public/assets/pots/
    public/assets/flowers/
    public/assets/gestures/
    public/assets/ui/

## Gameplay mapping

1. Seed selection
   - Display the three packet images.
   - When the player pinches a packet, switch to its loose seed image.
   - The loose seed follows the hand cursor until the pinch is released over the pot.

2. Planting
   - Before drop: pot-empty.png
   - After correct drop: pot-planted.png

3. Sun stage
   - Show sun.png above the pot.
   - Open-palm recognition triggers a gentle rise and warm light animation.

4. Rain stage
   - Show rain-cloud.png above the pot.
   - Wave recognition triggers the cloud and changes the pot to pot-watered.png.

5. Grow stage
   - Voice or sound triggers six growth frames:
       flower-01.png through flower-06.png
   - Crossfade each frame over roughly 300–450 ms.
   - Add a tiny upward scale and leaf sway, not a sudden image swap.

6. Final garden
   - Place the stage-06 image of each completed flower around the garden.
   - Keep all completed flowers visible.

## Important

The generated source sheets contained a visible checkerboard pattern rather than real transparency.
This pack has been separated and background-cleaned for direct game use.
Inspect pale edges once in the browser because automatic cleanup can leave a faint halo on a few assets.
