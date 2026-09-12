/**
 * Cycles frames on screen at a fixed rate. See docs/AGQP-SPEC.md §4.
 *
 * The cycle never stops on its own: the phone can join the sequence at any
 * index, and a frame it missed comes back on the next pass.
 */

export const DEFAULT_FPS = 8;

export class AnimatedQrScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;

  constructor(
    private readonly frames: readonly string[],
    private readonly fps: number = DEFAULT_FPS
  ) {
    if (frames.length === 0) throw new Error("agqp: nothing to display");
    if (fps <= 0) throw new Error("agqp: fps must be positive");
  }

  /** Starts cycling. Returns the stop function. */
  start(onFrame: (frame: string, index: number) => void): () => void {
    this.stop();
    this.index = 0;

    const tick = () => {
      onFrame(this.frames[this.index]!, this.index);
      this.index = (this.index + 1) % this.frames.length;
    };

    tick();
    this.timer = setInterval(tick, 1000 / this.fps);
    return () => this.stop();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
