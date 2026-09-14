import { useEffect, useState } from "react";

/**
 * Installing the vault on the phone.
 *
 * This matters more here than in most apps. The premise is a spare phone that
 * becomes a signer, and a browser tab is not that: it can be closed by
 * accident, it has no icon to hand someone, and on a phone with no network it
 * looks like a broken website rather than an app. Chrome will offer the
 * install itself, buried three taps into a menu nobody finds while filming.
 *
 * So the event is caught and held, and offered as a button instead.
 *
 * The button is shown whether or not the event ever arrives. Chrome decides
 * on its own schedule — a prompt dismissed once, an engagement threshold, a
 * fork that behaves differently — and a button that only exists when the
 * browser feels like it is a button nobody can be told to look for. Without
 * the event, and on Safari which never fires one, the same button says where
 * the browser keeps the command instead.
 */
export type InstallState =
  | { status: "installed" }
  | { status: "ready"; install: () => Promise<"accepted" | "dismissed"> }
  /** No programmatic prompt available; `how` is where the browser keeps it. */
  | { status: "manual"; how: string };

function isInstalled(): boolean {
  return (
    navigator.standalone === true ||
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches
  );
}

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac, and is told apart by having a touchscreen.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstallPrompt(): InstallState {
  const [installed, setInstalled] = useState(isInstalled);
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const held = (e: BeforeInstallPromptEvent) => {
      // Chrome shows its own bar unless this is prevented. Holding the event
      // is what lets the app choose the moment.
      e.preventDefault();
      setEvent(e);
    };
    const done = () => {
      setInstalled(true);
      setEvent(null);
    };

    addEventListener("beforeinstallprompt", held);
    addEventListener("appinstalled", done);

    // Installing from the browser's own menu fires `appinstalled`, but a
    // phone that was already running the installed copy fires nothing at all.
    const display = matchMedia("(display-mode: standalone)");
    display.addEventListener("change", () => setInstalled(isInstalled()));

    return () => {
      removeEventListener("beforeinstallprompt", held);
      removeEventListener("appinstalled", done);
    };
  }, []);

  if (installed) return { status: "installed" };

  if (event) {
    return {
      status: "ready",
      install: async () => {
        await event.prompt();
        const { outcome } = await event.userChoice;
        // The event is single-use: Chrome will fire a fresh one if the holder
        // declines and becomes interested later.
        setEvent(null);
        return outcome;
      },
    };
  }

  if (isIos()) {
    return { status: "manual", how: "Share, then Add to Home Screen." };
  }

  // Chrome, but no event yet. It still installs from the menu, and saying so
  // is better than an empty space where a button was supposed to be.
  return {
    status: "manual",
    how: "Open the browser menu (\u22ee) and choose Install app, or Add to Home screen.",
  };
}
