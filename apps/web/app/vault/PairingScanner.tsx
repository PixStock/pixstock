"use client";

import { useCallback, useRef, useState } from "react";
import {
  FrameAssembler,
  decodePayload,
  parseFrame,
  parseSignatureResponse,
} from "@pixstock/agqp";
import { makeDecoder } from "@/lib/qr-decoder";
import { openCamera } from "@/lib/camera";
import { content } from "@/content/site";
import { usePairedVault } from "@/lib/vault";
import { VaultField } from "@/components/VaultField";

type State =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "paired"; vault: string; label: string; network: string }
  | { status: "read"; text: string; recognised: string }
  | { status: "error"; message: string };

/**
 * Reads the vault's pairing code and remembers the address.
 *
 * What it saves is the transcription of forty-four base58 characters, which
 * is where someone sends money to the wrong place. What it does not do is
 * prove anything: a scanned address is still just an address, and the
 * guarantee that matters lives on the phone, which refuses to read an order
 * that does not name its own key.
 *
 * Anything else held up to the camera is named rather than swallowed — an
 * interface that claimed a vault was paired when it had decoded something
 * else would be the first lie in a product whose argument is that it does
 * not tell them.
 *
 * There is a typed way in as well, and it is not a nicety. Pairing is the
 * first thing anyone does here and nothing downstream works without it: with
 * no address, `/trade` and `/basket` cannot build an order at all. A camera
 * is the one part of this flow the machine might simply not have — a desktop
 * with no webcam, a browser that refuses the permission, a laptop whose
 * camera another application already holds — and every other optical step in
 * this product already keeps a paste channel beside it for exactly that.
 * This one did not, which made a missing webcam the end of the demo.
 */
export function PairingScanner() {
  const v = content.vault;
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const assembler = useRef(new FrameAssembler());
  const { vault, setVault } = usePairedVault();
  const [state, setState] = useState<State>({ status: "idle" });

  const stop = useCallback(() => {
    running.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setState((current) => (current.status === "scanning" ? { status: "idle" } : current));
  }, []);

  /**
   * One decoded code. Returns true when there is nothing left to scan.
   *
   * A pairing record is a normal AGQP payload, so it goes through the same
   * assembler as an order — one decoder, not two.
   */
  const consume = useCallback(
    (text: string): boolean => {
      if (text.startsWith("PVLT:")) {
        setState({
          status: "read",
          text: "",
          recognised: "a Paper-Vault backup, which belongs on paper, never in this browser",
        });
        return true;
      }

      if (!parseFrame(text)) {
        if (parseSignatureResponse(text)) {
          setState({ status: "read", text: "", recognised: "a signature reply, not a pairing code" });
          return true;
        }
        return false;
      }

      const progress = assembler.current.push(text);
      if (!progress.done || !progress.payload) return false;

      try {
        const payload = decodePayload(progress.payload);
        if (payload.kind !== "PAIR") {
          setState({
            status: "read",
            text: "",
            recognised: `a ${payload.kind} code, not a pairing code`,
          });
          return true;
        }

        setVault(payload.vault);
        setState({
          status: "paired",
          vault: payload.vault,
          label: payload.label,
          network: payload.network,
        });
        return true;
      } catch (err) {
        setState({ status: "error", message: (err as Error).message });
        return true;
      } finally {
        assembler.current.reset();
      }
    },
    [setVault],
  );

  const start = useCallback(async () => {
    setState({ status: "scanning" });

    try {
      stream.current = await openCamera();
    } catch (err) {
      setState({ status: "error", message: `Webcam unavailable: ${(err as Error).message}` });
      return;
    }

    // The element is rendered unconditionally, so this ref is populated
    // whatever the state. Mounting it only while `scanning` made it null at
    // exactly this line, and the early return fired silently — with the
    // camera already granted and lit, and nothing on screen to say why.
    const video = videoRef.current;
    if (!video) {
      running.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setState({ status: "error", message: "The video element is missing; reload the page." });
      return;
    }
    video.srcObject = stream.current;
    await video.play();

    const decode = makeDecoder();
    running.current = true;

    const tick = async () => {
      if (!running.current) return;
      try {
        for (const text of await decode(video)) {
          if (consume(text)) {
            running.current = false;
            stream.current?.getTracks().forEach((t) => t.stop());
            stream.current = null;
            return;
          }
        }
      } catch {
        // Dropped frame. The vault holds its code up; we try again.
      }
      requestAnimationFrame(() => void tick());
    };

    void tick();
  }, [consume]);

  return (
    <div className="stack-24">
      <div className="notice">
        <h3>{v.pending.title}</h3>
        <p className="copy">{v.pending.body}</p>
      </div>

      {/* Always mounted: the ref must exist before `start()` reads it. */}
      <video
        ref={videoRef}
        playsInline
        muted
        hidden={state.status !== "scanning"}
        className="webcam"
      />

      {state.status === "error" && <p className="alert-inline">{state.message}</p>}

      {state.status === "read" && <p className="copy">Read {state.recognised}.</p>}

      {state.status === "paired" && (
        <div className="notice">
          <h3>Paired with {state.label}</h3>
          <p className="copy">
            Orders on this browser will be built for{" "}
            <span className="mono-input">{state.vault}</span> on {state.network}. It is a public
            key. Nothing that can sign has touched this page.
          </p>
        </div>
      )}

      <div className="row-wrap">
        {state.status === "scanning" ? (
          <button type="button" className="btn" onClick={stop}>
            {v.pairing.stopLabel}
          </button>
        ) : (
          <button type="button" className="btn btn--solid" onClick={() => void start()}>
            {v.pairing.scanLabel}
          </button>
        )}
      </div>

      {/*
        Open already when the camera is the thing that failed. Someone who has
        just been told the webcam is unavailable should not then have to find
        a disclosure triangle to discover there was another way in.
      */}
      <details open={state.status === "error"}>
        <summary>{v.pairing.manualSummary}</summary>
        <div className="stack-24" style={{ marginTop: 12 }}>
          <p className="copy">{v.pairing.manualBody}</p>
          {/*
            Writes through the same store the scanner writes to, so the two
            paths cannot end up meaning different things. A half-typed address
            is kept rather than rejected — you are mid-keystroke — and it is
            `isValid` that holds the send button on /trade and /basket shut
            until it is a real one. The field says which it is as you type.
          */}
          <VaultField vault={vault} onChange={setVault} />
        </div>
      </details>
    </div>
  );
}
