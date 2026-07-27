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
 *   • при частичной оплате рядом чип с остатком («Долг 500 сом») — сумма
 *     остатка и есть операционный вопрос регистратуры;
 *   • статус-чип прячем, когда состояние уже понятно по другим меткам:
 *     завершён, оплачен/частично/скидка, есть заключение;
 *   • но «Отменено»/«Неявка» не прячем никогда — оплаченный отменённый приём
 *     иначе выглядел как обычное «Оплачено»;
 *   • если по правилам выше не осталось ни одного чипа, статус всё же
 *     показываем — иначе строка вообще без статуса (так было у «Завершено»
 *     без оплаты).
 *
 * Просроченный статус: бэк не закрывает приёмы (на проде 0 completed из 477 за
 * три недели, 199 приёмов остались in_progress спустя час+ после окончания).
 * Такой чип приглушаем и объясняем тултипом, иначе «На приёме» на вчерашнем
 * визите читается как «пациент в кабинете».
 *
 * Правила видимости — в statusChipState.ts (чистая функция + тесты).
 */
import React from "react";
import { Chip, Stack, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";

import {
  getStatusConfig,
  getStatusChipSx,
  getStatusLabel,
} from "../../config/appointmentStatuses";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { getStatusChipState } from "./statusChipState";
import type { AppointmentStatusSource } from "./statusChipState";

export type { AppointmentStatusSource };

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

const AppointmentStatusChips: React.FC<AppointmentStatusChipsProps> = ({
  appointment: appt,
  chipHeight,
  showPaymentMethodIcons = true,
  direction = "row",
  alwaysShowStatus = false,
}) => {
  const { t } = useT("appointments");
  const methods = appt.paymentMethods ?? [];

  const {
    showStatusChip,
    showPayChip,
    showDiscountChip,
    debtAmount,
    isOverdue,
    paymentStyleStatus,
  } = getStatusChipState(appt, { alwaysShowStatus });

  const statusCfg = getStatusConfig(appt.status);

  /** Стиль чипа + опциональная компактная высота.
   *  getStatusChipSx возвращает функцию от темы — её нельзя расплющить спредом
   *  (в паре мест так делали, и цвета чипа молча терялись), поэтому вызываем. */
  const chipSx = (statusCode: string, extra?: Record<string, unknown>): SxProps<Theme> =>
    (theme: Theme) => ({
      ...(getStatusChipSx(statusCode) as (t: Theme) => Record<string, unknown>)(theme),
      ...(chipHeight != null ? { height: chipHeight } : {}),
      ...extra,
    });

  const statusChip = (
    <Chip
      label={statusCfg.label}
      icon={statusCfg.icon}
      size="small"
      sx={chipSx(appt.status, isOverdue ? { opacity: 0.6 } : undefined)}
    />
  );

  return (
    <Stack
      direction={direction}
      alignItems={direction === "row" ? "center" : "flex-end"}
      gap={direction === "row" ? 1 : 0.5}
      flexWrap={direction === "row" ? "wrap" : undefined}
    >
      {showStatusChip &&
        (isOverdue ? (
          <Tooltip title={t("chips.overdue")}>
            {/* span: Chip со sx-функцией не пробрасывает ref тултипу */}
            <span>{statusChip}</span>
          </Tooltip>
        ) : (
          statusChip
        ))}

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

      {/* Остаток при частичной оплате — главный операционный вопрос кассы. */}
      {debtAmount != null && (
        <Chip
          label={t("chips.debt", { amount: formatKGS(debtAmount) })}
          size="small"
          sx={chipSx("debt")}
        />
      )}

      {showDiscountChip && (
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
