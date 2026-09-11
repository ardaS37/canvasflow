# CanvasFlow

CanvasFlow is a Manifest V3 Chrome extension that turns a reference image into low-resolution, palette-matched canvas clicks. It is designed as a configurable helper for browser drawing canvases, rather than being coupled to one game.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a supported drawing page and click the purple ✦ button.

## Use

1. Choose an image.
2. Press **Pick**, then click the drawing canvas.
3. In **Palette selector**, enter a selector for the page's colour swatches (for example `.color`, `.color-button`, or `[data-color]`) and press **Find**.
4. Set the output grid, then start.

The helper uses ordinary DOM pointer/click events. Pages that require trusted physical input may ignore them; the extension intentionally does not attempt to defeat those protections.
