/**
 * Ряд чипов-фильтров списка приёмов: ход визита и деньги в одной строке,
 * разделённые вертикальной чертой.
 *
 * Оси намеренно живут рядом, а не в двух строках: шапка списка и так занята
 * лентой исполнителей, а второй ряд отъедал бы у самого списка ~64px на
 * ноутбуке. Разделитель нужен, потому что оси не взаимоисключающие — «Пришёл»
 * и «Долг» выбираются вместе, и без черты они читались бы как один набор.
 *
 * Компонент используется дважды: в шапке карточки (десктоп) и внутри мобильного
 * листа фильтров — отсюда `wrap`, единственное отличие раскладки.
 */
import React from "react";
import { Box, Chip, Divider, Stack, useTheme, alpha } from "@mui/material";
import ClearIcon from "@mui/icons-material/CloseOutlined";

import { getStatusAccent, getStatusLabel } from "../../../config/appointmentStatuses";
import type { StatusCode } from "../../../config/appointmentStatuses";
import type { PaymentStatus } from "../../../api/payments";
import { PAYMENT_FILTER_OPTIONS, VISIT_FILTER_CODES } from "./listFilters";
import { useT } from "../../../i18n/VerticalProvider";
import { subtleBg } from "../../../theme";

type Props = {
  /** Коды статусов визита, встречающиеся в текущей выборке, со счётчиками. */
  statusCounts: Map<StatusCode, number>;
  selectedStatuses: StatusCode[];
  onToggleStatus: (code: StatusCode) => void;
  /** Счётчики по статусу оплаты; ось скрыта целиком, если не передана. */
  paymentCounts?: Map<PaymentStatus, number>;
  selectedPayments?: PaymentStatus[];
  onTogglePayment?: (value: PaymentStatus) => void;
  onReset: () => void;
  /** Мобильный лист: кнопка сброса отдельной строкой, чтобы её было легко попасть пальцем. */
  wrap?: boolean;
};

const AppointmentFilterChips: React.FC<Props> = ({
  statusCounts,
  selectedStatuses,
  onToggleStatus,
  paymentCounts,
  selectedPayments = [],
  onTogglePayment,
  onReset,
  wrap = false,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  // Показываем только то, что в выборке действительно есть: пустой чип
  // «Неявка · 0» занимал бы место и ничего не сообщал.
  const visitChips = VISIT_FILTER_CODES.filter((code) => (statusCounts.get(code) ?? 0) > 0);
  const moneyChips =
    paymentCounts && onTogglePayment
      ? PAYMENT_FILTER_OPTIONS.filter((o) => (paymentCounts.get(o.value) ?? 0) > 0)
      : [];

  const hasActive = selectedStatuses.length > 0 || selectedPayments.length > 0;

  // Ряд скрываем, только когда скрывать нечего И нечего сбрасывать: при
  // активном фильтре чипы могут исчезнуть все разом (например, у выбранного
  // специалиста в этот день нет ни одной записи) — и тогда снять фильтр было
  // бы нечем, список так и остался бы пустым без видимой причины.
  if (visitChips.length === 0 && moneyChips.length === 0 && !hasActive) return null;

  const chipSx = (accent: { main: string; text: string } | null, active: boolean) => ({
    height: 24,
    fontWeight: 500,
    flexShrink: 0,
    border: 1,
    borderColor: active ? alpha(accent?.main ?? theme.palette.primary.main, 0.4) : "divider",
    color: active ? accent?.text ?? theme.palette.primary.main : "text.secondary",
    bgcolor: active
      ? alpha(
          accent?.main ?? theme.palette.primary.main,
          theme.palette.mode === "dark" ? 0.16 : 0.08,
        )
      : "transparent",
    "&:hover": {
      bgcolor: active
        ? alpha(
            accent?.main ?? theme.palette.primary.main,
            theme.palette.mode === "dark" ? 0.22 : 0.12,
          )
        : subtleBg(theme, true),
    },
  });

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={0.75}
      // Чипы переносятся, а не скроллятся: в загруженном дне бывает 5 статусов
      // визита, и ось денег уезжала за край панели — «Оплачено» просто не было
      // видно, хотя это один из главных фильтров конца смены.
      sx={{ flexWrap: "wrap" }}
    >
      {visitChips.map((code) => {
        const active = selectedStatuses.includes(code);
        return (
          <Chip
            key={code}
            size="small"
            clickable
            onClick={() => onToggleStatus(code)}
            label={`${getStatusLabel(code)} · ${statusCounts.get(code) ?? 0}`}
            sx={chipSx(getStatusAccent(code, theme), active)}
          />
        );
      })}

      {visitChips.length > 0 && moneyChips.length > 0 && (
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.25, flexShrink: 0 }} />
      )}

      {moneyChips.map((o) => {
        const active = selectedPayments.includes(o.value);
        return (
          <Chip
            key={o.value}
            size="small"
            clickable
            onClick={() => onTogglePayment?.(o.value)}
            label={`${t(`registry.payFilter.${o.value}`)} · ${paymentCounts?.get(o.value) ?? 0}`}
            sx={chipSx(o.statusCode ? getStatusAccent(o.statusCode, theme) : null, active)}
          />
        );
      })}

      {/* Сброс появляется только когда есть что сбрасывать — иначе он был бы
          постоянным элементом ряда без функции. Отдельной строки применённых
          фильтров нет: при мультивыборе активность видна по самим чипам. */}
      {hasActive && (
        <Box sx={{ flexShrink: 0, ...(wrap && { width: "100%", mt: 0.5 }) }}>
          <Chip
            size="small"
            clickable
            variant="outlined"
            icon={<ClearIcon sx={{ fontSize: 14 }} />}
            onClick={onReset}
            label={t("filters.reset")}
            sx={{ height: 24, fontWeight: 500, color: "text.secondary" }}
          />
        </Box>
      )}
    </Stack>
  );
};

export default AppointmentFilterChips;
