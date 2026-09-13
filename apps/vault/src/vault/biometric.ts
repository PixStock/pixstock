import { sha256 } from "@noble/hashes/sha2.js";

/**
 * The phone's own biometric check, in front of the signature.
 *
 * WebAuthn with a *platform* authenticator is entirely local: the credential
 * lives in the phone's secure element and the assertion is produced there. No
 * server, no network, no relying party to reach — which is the only reason it
 * belongs in an app that must work in airplane mode forever.
 *
 * What it protects against is narrow and worth stating: someone holding the
 * unlocked phone. It is not a second factor for the key — the master password
 * is what decrypts the seed, and nothing here can replace it. So this gate
 * runs *before* the password, never instead of it.
 *
 * The challenge is the hash of the transaction being signed. An assertion
 * therefore attests to this order rather than to "a fingerprint happened",
 * which is what makes it evidence rather than theatre.
 */
const CREDENTIAL_KEY = "pixstock.vault.credential.v1";
const RP_NAME = "PixStock Vault";

export type BiometricState =
  | { status: "unsupported"; reason: string }
  | { status: "not-enrolled" }
  | { status: "enrolled"; credentialId: Uint8Array };

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Whether this device can do a local biometric check at all. */
export async function biometricSupport(): Promise<{ available: boolean; reason: string }> {
  if (typeof PublicKeyCredential === "undefined") {
    return { available: false, reason: "This browser has no WebAuthn." };
  }
  if (!globalThis.isSecureContext) {
    // localhost counts as secure; plain http on a LAN address does not.
    return { available: false, reason: "WebAuthn needs a secure context (https, or localhost)." };
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return {
      available,
      reason: available ? "" : "This device has no screen lock or biometric sensor set up.",
    };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

export function storedCredential(): Uint8Array | null {
  const stored = localStorage.getItem(CREDENTIAL_KEY);
  if (!stored) return null;
  try {
    return fromBase64(stored);
  } catch {
    return null;
  }
}

export function forgetCredential(): void {
  localStorage.removeItem(CREDENTIAL_KEY);
}

/**
 * Enrols this device's biometric, once, at vault creation.
 *
 * Returns null when the device cannot do it. That is not an error: a spare
 * phone with no screen lock is still a perfectly good air-gapped signer, and
 * refusing to set one up would be worse than saying so.
 */
export async function enrolBiometric(publicKey: Uint8Array): Promise<Uint8Array | null> {
  const support = await biometricSupport();
  if (!support.available) return null;

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: RP_NAME },
      user: {
        // The vault's own public key is its identity here. No name, no email,
        // nothing that would identify a person — the phone is the account.
        id: publicKey as BufferSource,
        name: `vault-${toBase64(publicKey.slice(0, 6))}`,
        displayName: RP_NAME,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) return null;

  const id = new Uint8Array(credential.rawId);
  localStorage.setItem(CREDENTIAL_KEY, toBase64(id));
  return id;
}

export class BiometricRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BiometricRefused";
  }
}

/**
 * Asks for the biometric, bound to this transaction.
 *
 * Throws if the holder cancels or the check fails; the caller must not treat
 * a rejection as permission to carry on. Returns false when nothing was
 * enrolled, so the screen can say the gate is not in place rather than
 * pretending it passed.
 */
export async function confirmBiometric(message: Uint8Array): Promise<boolean> {
  const credentialId = storedCredential();
  if (!credentialId) return false;

  let assertion: Credential | null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        // Bound to the order: this assertion says "this phone's owner approved
        // these exact bytes", not merely "a finger touched the sensor".
        challenge: sha256(message) as BufferSource,
        allowCredentials: [{ type: "public-key", id: credentialId as BufferSource }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
  } catch (err) {
    throw new BiometricRefused(
      `The biometric check did not pass: ${(err as Error).message}. Nothing was signed.`,
    );
  }

  if (!assertion) {
    throw new BiometricRefused("The biometric check was cancelled. Nothing was signed.");
  }
  return true;
}
