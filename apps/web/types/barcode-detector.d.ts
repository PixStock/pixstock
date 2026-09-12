/**
 * `BarcodeDetector` is not in lib.dom yet. Chrome on Android ships it, which
 * is the demo device — and it costs zero bytes and zero requests, unlike a
 * WebAssembly decoder that would have to fetch its module.
 */
declare global {
  interface DetectedBarcode {
    rawValue: string;
    format: string;
    boundingBox: DOMRectReadOnly;
  }

  class BarcodeDetector {
    constructor(options?: { formats?: string[] });
    static getSupportedFormats(): Promise<string[]>;
    detect(source: CanvasImageSource | Blob | ImageData): Promise<DetectedBarcode[]>;
  }
}

export {};
