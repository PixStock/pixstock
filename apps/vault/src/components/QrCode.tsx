import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * A single static QR. Error correction M, alphanumeric mode — every payload
 * the vault shows (signature reply, Paper-Vault) stays inside that character
 * set, which is what keeps the code small enough to read off a screen or a
 * printed sheet.
 */
export function QrCode({
  text,
  px = 320,
  className = "qr",
}: {
  text: string;
  px?: number;
  /** The reply screen wants it at full content width; the default is capped. */
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, text, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: px,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err: Error) => setError(err.message));
  }, [text, px]);

  if (error) {
    return (
      <p className="alert" role="alert">
        Cannot render this code: {error}
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={px}
      height={px}
      className={className}
      role="img"
      aria-label="QR code"
    />
  );
}
