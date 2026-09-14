/**
 * Opens a camera pointed the right way.
 *
 * `{ video: true }` lets the browser choose, and on a phone it chooses the
 * selfie camera — which cannot see the screen you are holding the phone up
 * to. On a laptop it happens to be right, because there is only one camera to
 * pick, so the bug hides on exactly the machine this is usually developed on
 * and appears the moment a second phone stands in for the laptop.
 *
 * `ideal` rather than `exact`: a preference a device without a rear camera
 * can ignore, instead of a demand it has to fail. The vault asks the same way.
 */
export async function openCamera(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
  } catch (err) {
    // Some combinations reject a facingMode they cannot satisfy rather than
    // ignoring it. Any camera beats no camera.
    if ((err as Error).name !== "OverconstrainedError") throw err;
    return navigator.mediaDevices.getUserMedia({ video: true });
  }
}
