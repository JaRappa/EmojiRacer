/**
 * Virtual joystick — rendered in the bottom-right corner on touch devices.
 * One thumb controls both steer (horizontal axis) and throttle (vertical axis).
 * Up = accelerate, Down = brake/reverse, Left/Right = steer.
 */

export interface JoystickInput {
  throttle: number; // -1 (full brake) to 1 (full accelerate)
  steer: number;    // -1 (full left) to 1 (full right)
}

type JoystickCallback = (input: JoystickInput) => void;

interface JoystickState {
  active: boolean;
  steer: number;
  throttle: number;
  baseX: number;
  baseY: number;
  baseRadius: number;
  thumbRadius: number;
}

export interface JoystickHandle {
  render: (ctx: CanvasRenderingContext2D) => void;
  destroy: () => void;
  isActive: () => boolean;
}

export function createJoystick(
  canvas: HTMLCanvasElement,
  onInput: JoystickCallback,
): JoystickHandle {
  const state: JoystickState = {
    active: false,
    steer: 0,
    throttle: 0,
    baseX: 0,
    baseY: 0,
    baseRadius: 60,
    thumbRadius: 26,
  };

  let activePointerId: number | null = null;

  // ── Layout ──────────────────────────────────────────────────────
  function layout(): void {
    const margin = 20;
    state.baseX = canvas.clientWidth - state.baseRadius - margin;
    state.baseY = canvas.clientHeight - state.baseRadius - margin;
  }

  layout();
  window.addEventListener('resize', layout);

  // ── Input computation ───────────────────────────────────────────
  function computeInput(touchX: number, touchY: number): JoystickInput {
    const dx = touchX - state.baseX;
    const dy = touchY - state.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = state.baseRadius;

    // Clamp to base radius
    const clampedDist = Math.min(dist, maxDist);
    const normX = dist > 0.001 ? (dx / dist) * (clampedDist / maxDist) : 0;
    const normY = dist > 0.001 ? (dy / dist) * (clampedDist / maxDist) : 0;

    return {
      steer: normX,                              // horizontal → steer
      throttle: Math.max(-1, Math.min(1, -normY)), // vertical → throttle (inverted: up = positive)
    };
  }

  function applyInput(touchX: number, touchY: number): void {
    const input = computeInput(touchX, touchY);
    state.steer = input.steer;
    state.throttle = input.throttle;
    state.active = true;
    onInput(input);
  }

  function resetInput(): void {
    state.active = false;
    state.steer = 0;
    state.throttle = 0;
    onInput({ throttle: 0, steer: 0 });
  }

  // ── Touch handlers ──────────────────────────────────────────────
  function onTouchStart(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (activePointerId === null) {
        // Accept touch if it's within 1.5× the base radius (generous hit area)
        const dx = t.clientX - state.baseX;
        const dy = t.clientY - state.baseY;
        if (Math.sqrt(dx * dx + dy * dy) < state.baseRadius * 1.5) {
          activePointerId = t.identifier;
          applyInput(t.clientX, t.clientY);
          e.preventDefault();
        }
      }
    }
  }

  function onTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activePointerId) {
        applyInput(t.clientX, t.clientY);
        e.preventDefault();
      }
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activePointerId) {
        activePointerId = null;
        resetInput();
        e.preventDefault();
      }
    }
  }

  function onTouchCancel(_e: TouchEvent): void {
    activePointerId = null;
    resetInput();
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });

  // ── Render ──────────────────────────────────────────────────────
  function render(ctx: CanvasRenderingContext2D): void {
    const { baseX, baseY, baseRadius, thumbRadius, steer, throttle, active } = state;

    ctx.save();

    // Drop shadow for base
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;

    // Base (outer ring)
    ctx.beginPath();
    ctx.arc(baseX, baseY, baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 20, 40, 0.55)';
    ctx.fill();
    ctx.shadowColor = 'transparent'; // shadow only on fill
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner guide ring
    ctx.beginPath();
    ctx.arc(baseX, baseY, baseRadius * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(baseX - baseRadius + 8, baseY);
    ctx.lineTo(baseX + baseRadius - 8, baseY);
    ctx.moveTo(baseX, baseY - baseRadius + 8);
    ctx.lineTo(baseX, baseY + baseRadius - 8);
    ctx.stroke();

    // Thumb position
    const thumbX = baseX + steer * baseRadius;
    const thumbY = baseY - throttle * baseRadius;

    // Thumb shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;

    // Thumb (inner circle)
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, thumbRadius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(thumbX - 4, thumbY - 4, thumbRadius * 0.1, thumbX, thumbY, thumbRadius);
    gradient.addColorStop(0, active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, active ? 'rgba(200,200,240,0.55)' : 'rgba(200,200,240,0.3)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function isActive(): boolean {
    return state.active;
  }

  function destroy(): void {
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchCancel);
    window.removeEventListener('resize', layout);
  }

  return { render, destroy, isActive };
}

/** Detect whether the device has a touch screen. */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
