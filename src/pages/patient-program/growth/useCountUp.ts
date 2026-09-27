import React from "react";

/** Число «набегает» от нуля до значения; без анимации — сразу значение. */
export function useCountUp(target: number | null, animate: boolean, durationMs = 900): number | null {
  const [value, setValue] = React.useState<number | null>(animate && target != null ? 0 : target);
  React.useEffect(() => {
    if (target == null || !animate) {
      setValue(target);
      return undefined;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      setValue(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate, durationMs]);
  return value;
}
