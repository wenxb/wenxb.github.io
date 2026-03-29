export async function enhanceMedia(images) {
  const items = Array.from(images);
  if (!items.length) {
    return;
  }

  const { default: mediumZoom } = await import("https://cdn.jsdelivr.net/npm/medium-zoom@1/+esm");
  mediumZoom(items, {
    background: "rgba(2, 6, 23, 0.82)",
    margin: 24,
    scrollOffset: 48,
  });
}
