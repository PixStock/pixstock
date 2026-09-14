import jsQR from "jsqr";

/** Reads whatever QR codes are in the current video frame. */
export type Decoder = (video: HTMLVideoElement) => Promise<string[]>;

/**
 * The native decoder where the browser has one, a bundled decoder everywhere
 * else.
 *
 * Chrome ships the Shape Detection API on Android and ChromeOS and nowhere
 * else — not on desktop Linux, not on Windows, not on Firefox or Safari.
 * This side of the optical channel runs on a laptop by definition, since it
 * is the laptop holding the order up to the phone, so the fallback is the
 * common path rather than the exotic one. Relying on `BarcodeDetector` alone
 * left every scan button on this app dead on the machine the demo is filmed
 * on, and the only way through was pasting Base45 by hand.
 *
 * The vault keeps its own scanner: it runs on a phone, where the native
 * decoder exists and is faster, and it may not import from here anyway.
 */
export function makeDecoder(): Decoder {
  if (typeof BarcodeDetector !== "undefined") {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video)).map((code) => code.rawValue);
  }

  // One canvas for the whole scan, not one per frame: this runs on every
  // animation frame, and allocating a full-resolution buffer sixty times a
  // second is how a scanner becomes a slideshow.
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  return async (video) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!context || width === 0 || height === 0) return [];

    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const found = jsQR(context.getImageData(0, 0, width, height).data, width, height);
    return found ? [found.data] : [];
  };
}
