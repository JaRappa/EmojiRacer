/**
 * Game loop — fixed-timestep simulation at 60 Hz with interpolation.
 * Physics identical on 60 Hz and 144 Hz displays.
 */

export type SimulateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25; // clamp to survive tab-switch

export function startLoop(simulate: SimulateFn, render: RenderFn): () => void {
  let running = true;
  let accumulator = 0;
  let lastTime = 0;

  function frame(currentTime: number) {
    if (!running) return;

    const realDt = lastTime === 0 ? FIXED_DT : (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    accumulator += Math.min(realDt, MAX_FRAME_TIME);

    while (accumulator >= FIXED_DT) {
      simulate(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    const alpha = accumulator / FIXED_DT;
    render(alpha);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return () => {
    running = false;
  };
}
