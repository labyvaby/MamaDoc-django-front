import React from "react";
import { Navigate, useSearchParams } from "react-router";

import { bookPath, useBookingOrgSlug } from "./orgSlug";

/**
 * Возврат с Paylink Бакай Банка — банк ведёт гостя на фиксированный адрес
 * `/book/payment/result?code=<code>` (задан на бэке при создании ссылки), у
 * витрины отдельного экрана результата нет. Дальше судьбу оплаты решает не эта
 * страница, а поллинг `payment.status` на карточке брони — просто уводим туда.
 */
const PaymentResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orgSlug = useBookingOrgSlug();
  const code = searchParams.get("code")?.trim();

  return <Navigate to={bookPath(code ? `/book/b/${code}` : "/book", orgSlug)} replace />;
};

export default PaymentResultPage;
