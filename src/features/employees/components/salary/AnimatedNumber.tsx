import React from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";

/** Сумма в сомах, целыми: в сводке тыйыны только мешают, точные — в отчёте ЗП. */
export const formatSom = (value: number): string => Math.round(value).toLocaleString("ru-RU");

type Props = {
  value: number;
  format?: (value: number) => string;
  /** Мягко «докрутить» с нуля при первом показе. */
  countUpOnMount?: boolean;
};

/**
 * Число, которое плавно докручивается до нового значения: сумма в шапке
 * растёт при открытии и пересчитывается на глазах при правке ставок.
 * При «уменьшить движение» в системе — сразу итог, без анимации.
 */
export const AnimatedNumber: React.FC<Props> = ({
  value,
  format = formatSom,
  countUpOnMount = true,
}) => {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(countUpOnMount && !reduceMotion ? 0 : value);
  const [shown, setShown] = React.useState(motionValue.get());

  useMotionValueEvent(motionValue, "change", (latest) => setShown(latest));

  React.useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return undefined;
    }
    const controls = animate(motionValue, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [motionValue, value, reduceMotion]);

  return <>{format(shown)}</>;
};
