import { describe, it, expect } from 'vitest';
import { createCar, simulateCar } from '../src/game/car';
import { MAX_SPEED } from '../src/game/constants';

describe('Car physics', () => {
  it('accelerates when throttle is applied', () => {
    const car = createCar({ startX: 0, startY: 0, startHeading: 0 });
    car.throttleInput = 1;

    // Simulate 60 ticks (1 second) on road
    for (let i = 0; i < 60; i++) {
      simulateCar(car, 1 / 60, true);
    }

    expect(car.speed).toBeGreaterThan(0);
    expect(car.x).toBeGreaterThan(0); // moving right
  });

  it('decelerates on off-road surface', () => {
    const car = createCar({ startX: 0, startY: 0, startHeading: 0 });
    car.throttleInput = 1;

    // Get up to speed on road
    for (let i = 0; i < 60; i++) {
      simulateCar(car, 1 / 60, true);
    }
    const roadSpeed = car.speed;

    // Now go off-road
    simulateCar(car, 1 / 60, false);
    expect(car.speed).toBeLessThan(roadSpeed);
  });

  it('brakes and reverses', () => {
    const car = createCar({ startX: 0, startY: 0, startHeading: 0 });
    car.throttleInput = 1;

    // Speed up
    for (let i = 0; i < 60; i++) {
      simulateCar(car, 1 / 60, true);
    }

    expect(car.speed).toBeGreaterThan(0);

    // Brake hard
    car.throttleInput = -1;
    for (let i = 0; i < 120; i++) {
      simulateCar(car, 1 / 60, true);
    }

    expect(car.speed).toBeLessThan(0); // reversed
  });

  it('approaches steady-state speed (drag balance)', () => {
    const car = createCar({ startX: 0, startY: 0, startHeading: 0 });
    car.throttleInput = 1;

    // Simulate for a long time — reaches MAX_SPEED (new drag is very low, car hits cap)
    for (let i = 0; i < 600; i++) {
      simulateCar(car, 1 / 60, true);
    }

    expect(car.speed).toBeLessThanOrEqual(MAX_SPEED);
    // Near max speed (ACCEL/DRAG ≈ 1000, but clamped to 420)
    expect(car.speed).toBeGreaterThan(380);
  });

  it('barely rotates when stationary', () => {
    const car = createCar({ startX: 0, startY: 0, startHeading: 0 });
    car.steerInput = 1; // full right
    const initialHeading = car.heading;

    // Simulate one tick at standstill
    simulateCar(car, 1 / 60, true);

    // Should barely rotate at standstill (angular velocity rapidly damped)
    expect(Math.abs(car.heading - initialHeading)).toBeLessThan(0.004);
  });

  it('deterministic physics (fixed timestep)', () => {
    const runA = () => {
      const car = createCar({ startX: 0, startY: 0, startHeading: 0 });
      car.throttleInput = 1;
      car.steerInput = 0.5;

      // Run 120 ticks at 60Hz
      for (let i = 0; i < 120; i++) {
        simulateCar(car, 1 / 60, true);
      }
      return { x: car.x, y: car.y, speed: car.speed, heading: car.heading };
    };

    const a = runA();
    const b = runA();

    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.speed).toBe(b.speed);
    expect(a.heading).toBe(b.heading);
  });
});
