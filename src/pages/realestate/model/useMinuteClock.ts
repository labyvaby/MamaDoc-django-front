import React from "react";

/** Текущее время с шагом в минуту — таймеры броней на шахматке и в списке. */
export function useMinuteClock() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
