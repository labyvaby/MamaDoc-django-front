/**
 * Фильтры дня Регистратуры в query-параметрах.
 *
 * Почему URL, а не useState: фильтры терялись при перезагрузке и принудительно
 * сбрасывались при каждой смене даты, хотя листают дни как раз для того, чтобы
 * посмотреть загрузку одного специалиста. Заодно отобранный день становится
 * ссылкой, которую можно передать коллеге.
 *
 * Пишем через `replace`, чтобы клики по чипам не забивали историю браузера:
 * иначе «назад» пришлось бы жать по разу на каждый снятый фильтр.
 */
import React from "react";
import { useSearchParams } from "react-router";

import {
  MONEY_FLAG_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  VISIT_FILTER_CODES,
  type AppointmentMoneyFlag,
} from "./components/listFilters";
import type { StatusCode } from "../../config/appointmentStatuses";
import type { PaymentStatus } from "../../api/payments";

const PARAM = {
  search: "q",
  doctor: "doctor",
  status: "status",
  payment: "pay",
  /** Скидки и правки цены: `money=discount,price_up`. */
  money: "money",
} as const;

const PAYMENT_VALUES = PAYMENT_FILTER_OPTIONS.map((o) => o.value);

/** Разбор csv-параметра с отбраковкой чужих значений (URL правят руками). */
function parseCsv<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
}

export function useReceptionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const doctorRaw = searchParams.get(PARAM.doctor);
  const doctorFilter = doctorRaw && Number.isFinite(Number(doctorRaw)) ? Number(doctorRaw) : null;
  const statusRaw = searchParams.get(PARAM.status);
  const paymentRaw = searchParams.get(PARAM.payment);
  const moneyRaw = searchParams.get(PARAM.money);

  const statusFilter = React.useMemo(
    () => parseCsv<StatusCode>(statusRaw, VISIT_FILTER_CODES),
    [statusRaw],
  );
  const paymentFilter = React.useMemo(
    () => parseCsv<PaymentStatus>(paymentRaw, PAYMENT_VALUES),
    [paymentRaw],
  );
  const moneyFlagFilter = React.useMemo(
    () => parseCsv<AppointmentMoneyFlag>(moneyRaw, MONEY_FLAG_OPTIONS),
    [moneyRaw],
  );

  /**
   * Правка нескольких параметров ЗА ОДИН вызов setSearchParams.
   *
   * ⚠ Два вызова подряд в одном обработчике не складываются: react-router
   * отдаёт обоим один и тот же `prev`, и второй перетирает первый. На этом
   * молча ломался сброс фильтров — снимался только последний.
   */
  const setParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev: URLSearchParams) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setParam = React.useCallback(
    (key: string, value: string | null) => setParams({ [key]: value }),
    [setParams],
  );

  // Поисковая строка — единственный фильтр, который набирают посимвольно.
  // Держать её только в URL нельзя: setSearchParams обновляет адрес через
  // навигацию, и при быстром вводе поле теряло символы (в URL доезжал
  // последний). Поэтому источник для поля — локальное состояние, а в адрес
  // запрос уезжает с задержкой; из URL читаем один раз, при монтировании.
  const [searchQuery, setSearchQueryState] = React.useState(
    () => searchParams.get(PARAM.search) ?? "",
  );
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    [],
  );

  const setSearchQuery = React.useCallback(
    (value: string) => {
      setSearchQueryState(value);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        setParam(PARAM.search, value.trim() ? value : null);
      }, 400);
    },
    [setParam],
  );

  return {
    searchQuery,
    setSearchQuery,
    doctorFilter,
    setDoctorFilter: React.useCallback(
      (employeeId: number | null) => setParam(PARAM.doctor, employeeId ? String(employeeId) : null),
      [setParam],
    ),
    statusFilter,
    setStatusFilter: React.useCallback(
      (codes: StatusCode[]) => setParam(PARAM.status, codes.length ? codes.join(",") : null),
      [setParam],
    ),
    paymentFilter,
    setPaymentFilter: React.useCallback(
      (values: PaymentStatus[]) => setParam(PARAM.payment, values.length ? values.join(",") : null),
      [setParam],
    ),
    moneyFlagFilter,
    setMoneyFlagFilter: React.useCallback(
      (values: AppointmentMoneyFlag[]) =>
        setParam(PARAM.money, values.length ? values.join(",") : null),
      [setParam],
    ),
    /** Сброс всех осей чипов — одним обновлением URL (см. setParams). */
    resetChipFilters: React.useCallback(
      () => setParams({ [PARAM.status]: null, [PARAM.payment]: null, [PARAM.money]: null }),
      [setParams],
    ),
  };
}
