/**
 * Ряд чипов-фильтров списка приёмов: деньги и ход визита в одной строке,
 * разделённые вертикальной чертой.
 *
 * Деньги идут первыми: «Оплачено» — главный фильтр конца смены, и в конце
 * ряда он тонул среди статусов визита, которых в загруженном дне до пяти.
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
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";

import { getStatusAccent, getStatusLabel } from "../../../config/appointmentStatuses";
import type { StatusCode } from "../../../config/appointmentStatuses";
import type { PaymentStatus } from "../../../api/payments";
import {
  MONEY_FLAG_LABEL_KEY,
  MONEY_FLAG_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  VISIT_FILTER_CODES,
  type AppointmentMoneyFlag,
} from "./listFilters";
import { useT } from "../../../i18n/VerticalProvider";
import { subtleBg } from "../../../theme";

/** Значок оси цены: скидка — ярлык, правки цены — стрелка направления. */
const PRICE_FLAG_ICON: Record<AppointmentMoneyFlag, typeof LocalOfferOutlined> = {
  discount: LocalOfferOutlined,
  price_up: TrendingUpOutlined,
  price_down: TrendingDownOutlined,
};

type Props = {
  /** Коды статусов визита, встречающиеся в текущей выборке, со счётчиками. */
  statusCounts: Map<StatusCode, number>;
  selectedStatuses: StatusCode[];
  onToggleStatus: (code: StatusCode) => void;
  /** Счётчики по статусу оплаты; ось скрыта целиком, если не передана. */
  paymentCounts?: Map<PaymentStatus, number>;
  selectedPayments?: PaymentStatus[];
  onTogglePayment?: (value: PaymentStatus) => void;
  /** Счётчики скидок и правок цены; ось скрыта целиком, если не передана. */
  moneyCounts?: Map<AppointmentMoneyFlag, number>;
  selectedMoneyFlags?: AppointmentMoneyFlag[];
  onToggleMoneyFlag?: (value: AppointmentMoneyFlag) => void;
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
  moneyCounts,
  selectedMoneyFlags = [],
  onToggleMoneyFlag,
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
  const priceChips =
    moneyCounts && onToggleMoneyFlag
      ? MONEY_FLAG_OPTIONS.filter((flag) => (moneyCounts.get(flag) ?? 0) > 0)
      : [];

  const hasActive =
    selectedStatuses.length > 0 || selectedPayments.length > 0 || selectedMoneyFlags.length > 0;

  // Ряд скрываем, только когда скрывать нечего И нечего сбрасывать: при
  // активном фильтре чипы могут исчезнуть все разом (например, у выбранного
  // специалиста в этот день нет ни одной записи) — и тогда снять фильтр было
  // бы нечем, список так и остался бы пустым без видимой причины.
  if (visitChips.length === 0 && moneyChips.length === 0 && priceChips.length === 0 && !hasActive)
    return null;

  const chipSx = (accent: { main: string; text: string } | null, active: boolean) => ({
    height: 26,
    fontWeight: 500,
    flexShrink: 0,
    border: 1,
    borderColor: active ? alpha(accent?.main ?? theme.palette.primary.main, 0.4) : "divider",
    // Метка неактивного чипа — приглушённая, но не «выключенная»: цвет статуса
    // несёт точка, а пять разноцветных подписей в ряду спорили бы друг с другом.
    color: active ? accent?.text ?? theme.palette.primary.main : "text.secondary",
    bgcolor: active
      ? alpha(
          accent?.main ?? theme.palette.primary.main,
          theme.palette.mode === "dark" ? 0.16 : 0.08,
        )
      : "transparent",
    "& .MuiChip-label": { px: 1 },
    "&:hover": {
      bgcolor: active
        ? alpha(
            accent?.main ?? theme.palette.primary.main,
            theme.palette.mode === "dark" ? 0.22 : 0.12,
          )
        : subtleBg(theme, true),
    },
  });

  /**
   * Содержимое чипа: точка статуса · метка · счётчик отдельным бейджем.
   *
   * Раньше счётчик был частью строки («Оплачено · 111») и читался как часть
   * названия. Отдельный бейдж отделяет «что фильтруем» от «сколько таких», а
   * `tabular-nums` держит ширину цифр постоянной: счётчики пересчитываются на
   * каждом обновлении списка (heartbeat 2.5с), и пропорциональные цифры
   * дёргали бы весь ряд при смене 99 → 100.
   */
  const chipContent = (
    accent: { main: string; text: string } | null,
    label: string,
    count: number,
    active: boolean,
    /** Иконка вместо точки: ось цены различается значком, а не цветом (см. ниже). */
    icon?: React.ReactNode,
  ) => (
    <Stack direction="row" alignItems="center" gap={0.75}>
      {icon ?? (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flexShrink: 0,
            // Нейтральные статусы (возврат) точки-«светофора» не заслуживают:
            // это не состояние дня, а редкий случай.
            bgcolor: accent?.main ?? theme.palette.text.disabled,
            opacity: active ? 1 : 0.75,
          }}
        />
      )}
      <Box component="span">{label}</Box>
      <Box
        component="span"
        sx={{
          fontSize: 11,
          lineHeight: "16px",
          minWidth: 16,
          px: 0.5,
          borderRadius: "6px",
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          bgcolor: active
            ? alpha(accent?.main ?? theme.palette.primary.main, 0.24)
            : subtleBg(theme, true),
          color: active ? "inherit" : "text.secondary",
        }}
      >
        {count}
      </Box>
    </Stack>
  );

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={0.75}
      // Чипы переносятся, а не скроллятся: в загруженном дне бывает 5 статусов
      // визита, и второй набор уезжал за край панели — часть фильтров просто
      // не была видна.
      sx={{ flexWrap: "wrap" }}
    >
      {moneyChips.map((o) => {
        const active = selectedPayments.includes(o.value);
        const accent = o.statusCode ? getStatusAccent(o.statusCode, theme) : null;
        return (
          <Chip
            key={o.value}
            size="small"
            clickable
            onClick={() => onTogglePayment?.(o.value)}
            label={chipContent(
              accent,
              t(`registry.payFilter.${o.value}`),
              paymentCounts?.get(o.value) ?? 0,
              active,
            )}
            sx={chipSx(accent, active)}
          />
        );
      })}

      {/* Ось цены идёт следом за оплатой без разделителя: это тоже про деньги,
          отдельная черта дробила бы ряд на три стайки. Различаются значком, а
          не цветом — цвет в списке приёмов занят статусами (см. CLAUDE.md). */}
      {priceChips.map((flag) => {
        const active = selectedMoneyFlags.includes(flag);
        // Скидка — единственный флаг со своим статусным цветом: он совпадает с
        // чипом «Со скидкой» в строке приёма, и расхождение бросалось бы в глаза.
        const accent = flag === "discount" ? getStatusAccent("discounted", theme) : null;
        const Icon = PRICE_FLAG_ICON[flag];
        return (
          <Chip
            key={flag}
            size="small"
            clickable
            onClick={() => onToggleMoneyFlag?.(flag)}
            label={chipContent(
              accent,
              t(`registry.moneyFilter.${MONEY_FLAG_LABEL_KEY[flag]}`),
              moneyCounts?.get(flag) ?? 0,
              active,
              <Icon
                sx={{
                  fontSize: 14,
                  flexShrink: 0,
                  color: active ? "inherit" : "text.disabled",
                }}
              />,
            )}
            sx={chipSx(accent, active)}
          />
        );
      })}

      {visitChips.length > 0 && (moneyChips.length > 0 || priceChips.length > 0) && (
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.25, flexShrink: 0 }} />
      )}

      {visitChips.map((code) => {
        const active = selectedStatuses.includes(code);
        const accent = getStatusAccent(code, theme);
        return (
          <Chip
            key={code}
            size="small"
            clickable
            onClick={() => onToggleStatus(code)}
            label={chipContent(
              accent,
              getStatusLabel(code),
              statusCounts.get(code) ?? 0,
              active,
            )}
            sx={chipSx(accent, active)}
          />
        );
      })}

      {/* Сброс появляется только когда есть что сбрасывать — иначе он был бы
          постоянным элементом ряда без функции. Отдельной строки применённых
          фильтров нет: при мультивыборе активность видна по самим чипам. */}
      {hasActive && (
        // display: flex — иначе чип внутри блочного Box выравнивается по
        // базовой линии текста и стоит на пару пикселей выше остальных чипов.
        <Box sx={{ flexShrink: 0, display: "flex", ...(wrap && { width: "100%", mt: 0.5 }) }}>
          <Chip
            size="small"
            clickable
            variant="outlined"
            icon={<ClearIcon sx={{ fontSize: 14 }} />}
            onClick={onReset}
            label={t("filters.reset")}
            sx={{ height: 26, fontWeight: 500, color: "text.secondary" }}
          />
        </Box>
      )}
    </Stack>
  );
};

export default AppointmentFilterChips;
