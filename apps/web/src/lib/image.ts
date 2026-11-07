/** Largest source file accepted before decoding (phone photos are routinely 3-12 MB). */
const MAX_SOURCE_BYTES = 25_000_000;
/** Server cap on the stored data URL (see PortraitSchema). Leaves headroom under 1.5 MB. */
const MAX_DATA_URL_CHARS = 1_400_000;

/**
 * Turns any browser-decodable image into a square-ish portrait data URL small enough to store:
 * scaled so the longest side is at most `maxSide`, re-encoded as WebP (JPEG where WebP encoding is
 * unsupported, e.g. older Safari). Quality steps down until it fits the server cap.
 */
export async function fileToPortrait(file: File, maxSide = 640): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|avif|heic|heif|bmp)$/i.test(file.name)) {
    throw new Error("Pick an image file (PNG, JPEG, WebP, GIF)");
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Image is larger than 25 MB");

  const bitmap = await decode(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images");
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap) bitmap.close();

  for (const quality of [0.86, 0.75, 0.6, 0.45]) {
    let url = canvas.toDataURL("image/webp", quality);
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= MAX_DATA_URL_CHARS) return url;
  }
  throw new Error("Image is too detailed to store; try a smaller crop");
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img>, which also handles formats some bitmap decoders reject */
    }
  }
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode().catch(() => {
      throw new Error("This image format is not supported by your browser (try JPEG or PNG)");
    });
    return img;
  } finally {
    URL.revokeObjectURL(src);
  }
}
