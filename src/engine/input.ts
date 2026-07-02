/**
 * Input abstraction — keyboard + touch, normalized output.
 * Exposes { throttle: -1..1, steer: -1..1 } so gameplay never sees raw events.
 */

export interface InputState {
  throttle: number; // -1 (full brake/reverse) to 1 (full accelerate)
  steer: number;    // -1 (full left) to 1 (full right)
}

type InputCallback = (state: InputState) => void;

export interface InitInputOptions {
  disableTouch?: boolean; // When true, no touch listeners are added (joystick handles mobile)
}

export function initInput(
  canvas: HTMLCanvasElement,
  onInput: InputCallback,
  options: InitInputOptions = {},
): () => void {
  const { disableTouch = false } = options;
  const keys = new Set<string>();

  function updateState(): InputState {
    const throttle =
      (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) +
      (keys.has('ArrowDown') || keys.has('KeyS') ? -1 : 0);
    const steer =
      (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) +
      (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0);

    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
    };
  }

  function onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
      e.preventDefault();
      keys.add(e.code);
      onInput(updateState());
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
    onInput(updateState());
  }

  // Touch controls: left half = steer (drag left/right from touch origin),
  // right half = hold to accelerate, two-finger tap = brake.
  let touches = new Map<number, Touch>();
  let steerOrigin: number | null = null;

  function updateTouchState(): InputState {
    let throttle = 0;
    let steer = 0;

    for (const t of touches.values()) {
      const x = t.clientX;
      const halfW = canvas.clientWidth / 2;
      if (x > halfW) {
        throttle = 1;
      } else {
        if (steerOrigin === null) steerOrigin = x;
        steer = (x - steerOrigin) / (halfW * 0.6);
        steer = Math.max(-1, Math.min(1, steer));
      }
    }

    // Two-finger = brake
    if (touches.size >= 2) {
      throttle = -1;
    }

    if (touches.size === 0) {
      steerOrigin = null;
    }

    return { throttle, steer };
  }

  function onTouchStart(e: TouchEvent) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      touches.set(t.identifier, t);
    }
    onInput(updateTouchState());
  }

  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      touches.set(t.identifier, t);
    }
    onInput(updateTouchState());
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      touches.delete(t.identifier);
    }
    onInput(updateTouchState());
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  if (!disableTouch) {
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  }

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
  };
}
