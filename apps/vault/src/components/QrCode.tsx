import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * A single static QR. Error correction M, alphanumeric mode — every payload
 * the vault shows (signature reply, Paper-Vault) stays inside that character
 * set, which is what keeps the code small enough to read off a screen or a
 * printed sheet.
 *
 * An <img>, not a <canvas>, and that is the whole point of this file.
 *
 * As a canvas every code in the vault drew 358 wide by 480 tall on a phone:
 * a square bitmap stretched into a rectangle, modules taller than they were
 * wide. `.stack` is a grid, a grid's default `align-items: normal` behaves as
 * `stretch`, and stretch sets the used height — which overrides `height:
 * auto`. The row took the canvas's natural 480, the box was stretched back to
 * fill it, and the width tracked the column. `align-self`, `aspect-ratio` and
 * `display: block` each fixed it when set from a devtools inspector and none
 * of them held from the stylesheet: the box is laid out once and nothing
 * invalidates it afterwards.
 *
 * An image has none of that. A replaced element with a natural aspect ratio
 * is exempt from stretch, and `height: auto` takes the ratio from the natural
 * size — which is exactly why `img { width: 100%; height: auto }` is the
 * idiom that has always worked. The distortion is gone by construction rather
 * than argued out of the cascade.
 *
 * It matters beyond looks: a decoder expects square modules, so a stretched
 * code is one a webcam reads slowly or not at all. This draws the Paper-Vault
 * sheet that is the only way back into a vault, and the signature reply the
 * laptop has to read to finish an order.
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
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: px,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (cancelled) return;
        setError(null);
        setSrc(url);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [text, px]);

  if (error) {
    return (
      <p className="alert" role="alert">
        Cannot render this code: {error}
      </p>
    );
  }

  // Held at its square from the first paint, so the page does not jump when
  // the data URL arrives a tick later.
  return (
    <img
      src={src ?? "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="}
      width={px}
      height={px}
      className={className}
      alt="QR code"
    />
  );
}
