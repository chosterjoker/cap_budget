// Browser-only helper for shrinking photos before they're sent to a Server
// Action / OCR. Phone photos are routinely 10-30MB and blow past BOTH limits in
// play here: Vercel caps serverless request bodies at ~4.5MB, and OpenAI rejects
// any single image over ~20MB. Downscaling to a sane resolution makes uploads
// small and fast, and actually *reads better*.

const MAX_DIMENSION = 2200; // longest edge, px — ample for reading a check/receipt
const JPEG_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 1_500_000; // already small enough; don't bother re-encoding

/**
 * Downscale + re-encode an image File to JPEG. Respects EXIF orientation (so
 * sideways phone photos come out upright). Best-effort: returns the original
 * File untouched if it isn't an image, is already small, or can't be decoded
 * (e.g. HEIC in a browser without support).
 */
export async function downscaleImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_DIMENSION / longest);

    // Nothing to gain: already within bounds and not a huge file.
    if (scale === 1 && file.size < SKIP_BELOW_BYTES) {
      bitmap.close?.();
      return file;
    }

    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file; // re-encode didn't help

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // undecodable format or canvas error — fall back to original
  }
}
