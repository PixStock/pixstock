/**
 * `beforeinstallprompt` is not in lib.dom: it is a Chromium extension to the
 * platform, which is also the browser this vault is meant to be installed
 * from. Safari has no equivalent and never fires it, so the code that uses
 * this type has to work when it never arrives.
 */
declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    prompt(): Promise<void>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }

  interface Navigator {
    /** Safari's own installed-app flag, years older than display-mode. */
    standalone?: boolean;
  }
}

export {};
