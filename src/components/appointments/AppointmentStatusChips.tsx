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
 * Две дорожки (StatusTrack в appointmentStatuses.tsx): ход визита рисуется
 * контуром, деньги — заливкой. Раньше обе дорожки делили палитру, и в строке
 * регистратуры «Подтверждён» совпадал цветом с «Оплачено картой», а «Пациент
 * здесь» — с «Оплачено наличными».
 *
 * Эталон — строка списка на странице «Приёмы» (AppointmentListPanel):
 *   • статус визита виден, пока чек не закрыт: регистратуре важно знать,
 *     пришёл человек или нет. После полной оплаты (или скидки на всю сумму)
 *     статус прячем — по просьбе регистратуры, дальше строка операционно
 *     закрыта. Частичная оплата чек не закрывает: там остаётся долг и статус.
 *     Исключение — отмена и неявка: их видно и по оплаченному приёму, иначе
 *     строка с невозвращёнными деньгами выглядит как обычное «Оплачено»;
 *   • чип оплаты («Оплачено» / «Частично оплачено») показываем всем ролям:
 *     факт оплаты — операционный статус (закрыт ли чек), а не финансовая
 *     деталь. Финансовые ДЕЙСТВИЯ и суммы остаются под правами у вызывающего;
 *   • «Оплачено» наличными и безналом различаются цветом чипа (зелёный против
 *     бирюзового) — регистратуре нужно видеть способ при скане списка, а одной
 *     иконки 16px внутри чипа для этого не хватало. Безнал здесь — только
 *     карта (см. statusChipState.ts);
 *   • скидка без оплат → отдельный чип с ФАКТИЧЕСКИМ процентом («Скидка 50%»),
 *     посчитанным из discountAmount/totalAmount: приём со скидкой иначе
 *     выглядит просто неоплаченным. Процент не берём из paymentStatus —
 *     чип с жёсткой подписью «Скидка 100%» подписывал так и половинные скидки;
 *   • при частичной оплате рядом чип с остатком («Долг 500 сом») — сумма
 *     остатка и есть операционный вопрос регистратуры.
 *
 * Просроченный статус: бэк не закрывает приёмы (на проде 0 completed из 477 за
 * три недели, 199 приёмов остались in_progress спустя час+ после окончания).
 * Такой чип помечаем пунктирным контуром и иконкой часов, объясняя тултипом:
 * иначе «На приёме» на вчерашнем визите читается как «пациент в кабинете».
 * Раньше вместо этого чип гасился opacity — метка теряла контраст и хуже
 * читалась, хотя приглушить требовалось значимость, а не сам текст.
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
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

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
  /**
   * Скрыть чип «Оплачено/Частично оплачено» — вызывающий сам покажет тот же
   * статус крупно (например, заголовок PaymentInfoBlock в карточке приёма),
   * дублировать его тут для этого зрителя не нужно. Долг и скидка остаются:
   * они несут доп. цифры, а не просто повторяют факт оплаты.
   */
  hidePayChip?: boolean;
  /**
   * Отменить случайную отметку «Пациент здесь». Крестик появляется только у
   * статуса arrived и только там, где вызывающий явно разрешил это действие.
   */
  onUndoArrived?: () => void;
}

const AppointmentStatusChips: React.FC<AppointmentStatusChipsProps> = ({
  appointment: appt,
  chipHeight,
  showPaymentMethodIcons = true,
  direction = "row",
  hidePayChip = false,
  onUndoArrived,
}) => {
  const { t } = useT("appointments");
  const methods = appt.paymentMethods ?? [];

  const {
    showStatusChip,
    showPayChip,
    showDiscountChip,
    discountPercent,
    debtAmount,
    totalAmount,
    isOverdue,
    paymentStyleStatus,
  } = getStatusChipState(appt);

  const statusCfg = getStatusConfig(appt.status);
  const canUndoArrived = appt.status === "arrived" && onUndoArrived != null;

  /** Стиль чипа + опциональная компактная высота.
   *  getStatusChipSx возвращает функцию от темы — её нельзя расплющить спредом
   *  (в паре мест так делали, и цвета чипа молча терялись), поэтому вызываем. */
  const chipSx = (statusCode: string, extra?: Record<string, unknown>): SxProps<Theme> =>
    (theme: Theme) => ({
      ...(getStatusChipSx(statusCode) as (t: Theme) => Record<string, unknown>)(theme),
      ...(chipHeight != null ? { height: chipHeight } : {}),
      ...(canUndoArrived
        ? {
            "& .MuiChip-deleteIcon": {
              color: "inherit",
              fontSize: 16,
              opacity: 0.72,
              "&:hover": { color: "inherit", opacity: 1 },
            },
          }
        : {}),
      ...extra,
    });

  // Просроченный: пунктирный контур + часы вместо иконки статуса. Текст
  // остаётся в полном контрасте — гасим значимость, а не читаемость.
  const statusChip = (
    <Chip
      label={statusCfg.label}
      icon={isOverdue ? <ScheduleOutlined fontSize="small" /> : statusCfg.icon}
      size="small"
      onDelete={canUndoArrived ? onUndoArrived : undefined}
      deleteIcon={canUndoArrived ? <CloseOutlined /> : undefined}
      sx={chipSx(appt.status, isOverdue ? { borderStyle: "dashed" } : undefined)}
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
        (isOverdue || canUndoArrived ? (
          <Tooltip title={canUndoArrived ? t("chips.undoArrived") : t("chips.overdue")}>
            {/* span: Chip со sx-функцией не пробрасывает ref тултипу */}
            <span>{statusChip}</span>
          </Tooltip>
        ) : (
          statusChip
        ))}

      {showPayChip && !hidePayChip && (
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

      {/* Остаток при частичной оплате — главный операционный вопрос кассы.
          Заменяет собой чип «Частично оплачено»: «Долг 1100 из 1600» несёт
          оба факта сразу. */}
      {debtAmount != null && (
        <Chip
          label={
            totalAmount != null
              ? t("chips.debtOfTotal", {
                  amount: formatKGS(debtAmount),
                  total: formatKGS(totalAmount),
                })
              : t("chips.debt", { amount: formatKGS(debtAmount) })
          }
          size="small"
          sx={chipSx("debt")}
        />
      )}

      {/* Процент берём из сумм приёма. Если сумм нет (укороченные формы приёма
          в дроверах), показываем нейтральное «Со скидкой» — врать про процент
          нельзя, на этом и ловилась прежняя жёсткая подпись «Скидка 100%». */}
      {showDiscountChip && (
        <Chip
          label={
            discountPercent != null
              ? t("chips.discountPercent", { percent: discountPercent })
              : getStatusLabel("discounted")
          }
          size="small"
          sx={chipSx("discounted")}
        />
      )}

      {/* «Страховка» — визит (со)оплачен страховой компанией. Живёт здесь, а
          не в списке приёмов: раньше чип рисовался только там, и в карточке
          приёма с историей пациента признак страховки пропадал. */}
      {methods.includes("insurance") && (
        <Tooltip title={t("list.insurancePayment")}>
          <span>
            <Chip
              label={
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <HealthAndSafetyOutlined sx={{ fontSize: 16 }} />
                  <span>{t("list.insurance")}</span>
                </Stack>
              }
              size="small"
              sx={chipSx("insurance")}
            />
          </span>
        </Tooltip>
      )}
    </Stack>
  );
};

export default AppointmentStatusChips;
