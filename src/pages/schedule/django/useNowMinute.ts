import React from "react";
import dayjs, { type Dayjs } from "dayjs";

/**
 * «Сейчас» с точностью до минуты. Без него метка текущего времени в расписании
 * «застывает» на моменте монтирования (dayjs() в рендере не обновляется сам).
 * Таймер выравнивается по границе минуты, а не тикает раз в 60с от монтирования,
 * иначе подпись отставала бы от реального времени до минуты.
 */
export const useNowMinute = (): Dayjs => {
  const [now, setNow] = React.useState<Dayjs>(() => dayjs());

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const msToNextMinute = (d: Dayjs) => 60_000 - (d.second() * 1000 + d.millisecond()) + 250;
    const tick = () => {
      const next = dayjs();
      setNow(next);
      timer = setTimeout(tick, msToNextMinute(next));
    };
    timer = setTimeout(tick, msToNextMinute(dayjs()));
    return () => clearTimeout(timer);
  }, []);

  return now;
};

export default useNowMinute;
