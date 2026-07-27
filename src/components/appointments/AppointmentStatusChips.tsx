/**
 * AppointmentStatusChips — единая пара чипов «статус приёма + статус оплаты».
 *
 * Зачем один компонент: раньше каждый экран рисовал чипы сам, и логика
 * расходилась. Страница «Приёмы» (регистратура) показывала факт оплаты и
 * скрывала неинформативный статус-чип, а история пациента и карточки
 * врача/пациента показывали только `status` приёма. Бэк при оплате статус
 * приёма не меняет, поэтому оплаченный приём выглядел там как «Ожидаем» —
 * врач и регистратор видели по одному приёму разное.
 *
 * Эталон — строка списка на странице «Приёмы» (AppointmentListPanel):
 *   • чип оплаты («Оплачено» / «Частично оплачено») показываем всем ролям:
 *     факт оплаты — операционный статус (закрыт ли чек), а не финансовая
 *     деталь. Финансовые ДЕЙСТВИЯ и суммы остаются под правами у вызывающего;
 *   • «Оплачено» только картой → синий чип (безнал), метка та же;
 *   • статус приёма 100% скидки бэк оставляет неоплаченным, а чек закрывает
 *     (paymentStatus=discounted без оплат) → отдельный чип «Скидка 100%»;
 *   • статус-чип прячем, когда состояние уже понятно по другим меткам:
 *     завершён, оплачен/частично/скидка, есть заключение;
 *   • но если по правилам выше не осталось ни одного чипа, статус всё же
 *     показываем — иначе строка вообще без статуса (так было у «Завершено»
 *     без оплаты).
 */
import React from "react";
import { Chip, Stack } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";

import type { DjangoAppointment } from "../../api/appointments";
import {
  getStatusConfig,
  getStatusChipSx,
  getStatusLabel,
} from "../../config/appointmentStatuses";
import { useT } from "../../i18n/VerticalProvider";

/** Приёму нужны только эти поля — чтобы компонент принимал и укороченные
 *  формы приёма из карточек-дроверов, а не только полный DjangoAppointment. */
export type AppointmentStatusSource = Pick<DjangoAppointment, "status"> &
  Partial<Pick<
    DjangoAppointment,
    "paymentStatus" | "paidTotal" | "paymentMethods" | "services"
  >>;

export interface AppointmentStatusChipsProps {
  appointment: AppointmentStatusSource;
  /** Компактная высота чипов (в узких списках-дроверах было 20px). */
  chipHeight?: number;
  /** Иконки способов оплаты внутри чипа оплаты (в узких панелях лишние). */
  showPaymentMethodIcons?: boolean;
  /** Раскладка: строка списка — row, узкая колонка — column. */
  direction?: "row" | "column";
  /** Не прятать статус-чип рядом с чипом оплаты. Для открытой карточки приёма:
   *  места хватает, а врачу нужны оба факта — и «В работе», и «Оплачено». */
  alwaysShowStatus?: boolean;
}

/** Есть ли по приёму заключение — бэк не отдаёт hasMedicalConclusion, выводим
 *  из строк услуг (та же логика, что в AppointmentListPanel и истории). */
const hasConclusionOf = (appt: AppointmentStatusSource): boolean =>
  (appt.services ?? []).some(
    (sl) =>
      sl.conclusionId != null ||
      sl.conclusionState === "draft" ||
      sl.conclusionState === "completed",
  );

const AppointmentStatusChips: React.FC<AppointmentStatusChipsProps> = ({
  appointment: appt,
  chipHeight,
  showPaymentMethodIcons = true,
  direction = "row",
  alwaysShowStatus = false,
}) => {
  const { t } = useT("appointments");
  const methods = appt.paymentMethods ?? [];
  const hasPaid = Number(appt.paidTotal ?? 0) > 0;
  const isCardOnly = methods.length === 1 && methods[0] === "card";

  // Стиль чипа подбираем по коду статуса, а не по метке: метка зависит от
  // вертикали бизнеса и ключом быть не может.
  const paymentStyleStatus =
    appt.paymentStatus === "paid" && isCardOnly
      ? "paid_cashless"
      : appt.paymentStatus === "paid"
      ? "paid"
      : appt.paymentStatus === "partial"
      ? "partially_paid"
      : appt.status;

  // 100% скидка: оплат нет (paidTotal=0), но чек закрыт — иначе приём выглядел
  // бы неоплаченным.
  const isDiscounted = appt.paymentStatus === "discounted" && !hasPaid;

  const hideStatusChip =
    appt.status === "completed" ||
    appt.paymentStatus === "paid" ||
    appt.paymentStatus === "partial" ||
    isDiscounted ||
    hasConclusionOf(appt);

  const showPayChip = hasPaid;
  // Ни одного чипа по правилам выше — показываем статус, чтобы не потерять его.
  const showStatusChip =
    alwaysShowStatus || !hideStatusChip || (!showPayChip && !isDiscounted);

  const statusCfg = getStatusConfig(appt.status);

  /** Стиль чипа + опциональная компактная высота.
   *  getStatusChipSx возвращает функцию от темы — её нельзя расплющить спредом
   *  (в паре мест так делали, и цвета чипа молча терялись), поэтому вызываем. */
  const chipSx = (statusCode: string): SxProps<Theme> => (theme: Theme) => ({
    ...(getStatusChipSx(statusCode) as (t: Theme) => Record<string, unknown>)(theme),
    ...(chipHeight != null ? { height: chipHeight } : {}),
  });

  return (
    <Stack
      direction={direction}
      alignItems={direction === "row" ? "center" : "flex-end"}
      gap={direction === "row" ? 1 : 0.5}
      flexWrap={direction === "row" ? "wrap" : undefined}
    >
      {showStatusChip && (
        <Chip
          label={statusCfg.label}
          icon={statusCfg.icon}
          size="small"
          sx={chipSx(appt.status)}
        />
      )}

      {showPayChip && (
        <Chip
          label={
            <Stack direction="row" alignItems="center" gap={0.5}>
              {showPaymentMethodIcons &&
                (methods.length > 0 ? (
                  <>
                    {methods.includes("cash") && <PaymentsOutlined sx={{ fontSize: 16 }} />}
                    {methods.includes("card") && <CreditCardOutlined sx={{ fontSize: 16 }} />}
                    {methods.includes("balance") && <AccountBalanceWalletOutlined sx={{ fontSize: 16 }} />}
                    {methods.includes("bonus") && <CardGiftcardOutlined sx={{ fontSize: 16 }} />}
                    {methods.includes("insurance") && <HealthAndSafetyOutlined sx={{ fontSize: 16 }} />}
                  </>
                ) : (
                  <PaymentsOutlined sx={{ fontSize: 16 }} />
                ))}
              <span>
                {paymentStyleStatus === "paid_cashless"
                  ? t("list.paid")
                  : getStatusLabel(paymentStyleStatus)}
              </span>
            </Stack>
          }
          size="small"
          sx={chipSx(paymentStyleStatus)}
        />
      )}

      {isDiscounted && (
        <Chip
          label={t("list.fullDiscount")}
          size="small"
          sx={chipSx("discounted")}
        />
      )}
    </Stack>
  );
};

export default AppointmentStatusChips;
