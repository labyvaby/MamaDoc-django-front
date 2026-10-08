import React from "react";
import { Box, ButtonBase, Skeleton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSnackbar } from "notistack";
import AssignmentLateOutlined from "@mui/icons-material/AssignmentLateOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CompareArrowsOutlined from "@mui/icons-material/CompareArrowsOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import HourglassBottomOutlined from "@mui/icons-material/HourglassBottomOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import { getReservation } from "../../api/realtyReservations";
import { getTaskFocus, realtyTaskKeys, type FocusItem, type FocusScope } from "../../api/realtyTasks";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { cardSx, focusHref, toneColor } from "./format";

const ICONS: Record<string, React.ElementType> = {
  "new-lead": BoltOutlined,
  "overdue-tasks": WarningAmberOutlined,
  "reservation-expiring": HourglassBottomOutlined,
  "shows-today": EventOutlined,
  "billing-overdue": PaymentsOutlined,
  alternatives: CompareArrowsOutlined,
  "no-next-step": AssignmentLateOutlined,
};

/**
 * «Фокус дня» — правая панель «Моего дня» (`frontend-new-modules.md` §5):
 * подсказки из живых данных — `GET /api/v2/realty/tasks/focus/`. Клик ведёт на
 * экран `view` и запись по id; `canAct: false` (руководитель смотрит команду) —
 * без кнопок действий.
 */
export function FocusPanel({ focusScope }: { focusScope: FocusScope | null }) {
  const { t } = useT("estateDashboard");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [opening, setOpening] = React.useState<number | null>(null);

  const focus = useQuery({
    queryKey: realtyTaskKeys.focus(scope, focusScope),
    queryFn: ({ signal }) => getTaskFocus({ scope: focusScope }, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 60_000,
    // Подсказки зависят от времени дня («Ответить за 5 минут», «Бронь истекает»).
    refetchInterval: 5 * 60_000,
  });

  const open = async (item: FocusItem, index: number) => {
    // Бронь — сразу на её квартиру в шахматке: там «Продлить» и «Договор».
    if (item.reservationId != null) {
      setOpening(index);
      try {
        const reservation = await getReservation(item.reservationId, scope);
        if (reservation.projectId != null && reservation.unitId) {
          navigate(`/realestate/chessboard?project=${reservation.projectId}&unit=${reservation.unitId}`);
          return;
        }
      } catch {
        enqueueSnackbar(t("focus.openFailed"), { variant: "warning" });
      } finally {
        setOpening(null);
      }
    }
    const href = focusHref(item);
    if (href) navigate(href);
  };

  // Панель вспомогательная: ошибка не ломает экран задач, подсказки просто не показываем.
  if (focus.error) return null;
  const data = focus.data;

  return (
    <Box component="aside" aria-label={t("focus.title")} sx={{ ...cardSx, p: 2, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700 }}>{t("focus.title")}</Typography>
      <Typography sx={{ mb: 1.5, minHeight: "1.2em", fontSize: "0.75rem", color: "text.secondary" }}>{data ? t(data.scope === "team" ? "focus.team" : "focus.mine") : ""}</Typography>
      {!data ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={84} sx={{ borderRadius: "10px" }} />
          ))}
        </Box>
      ) : data.items.length === 0 ? (
        <Box sx={{ py: 3, display: "grid", justifyItems: "center", gap: 0.75, textAlign: "center" }}>
          <CheckCircleOutlineOutlined sx={{ color: "success.main" }} />
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("focus.empty")}</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "grid", gap: 1 }}>
          {data.items.map((item, index) => (
            <FocusCard key={`${item.code}-${index}`} item={item} canAct={data.canAct} busy={opening === index} onOpen={() => void open(item, index)} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function FocusCard({ item, canAct, busy, onOpen }: { item: FocusItem; canAct: boolean; busy: boolean; onOpen: () => void }) {
  const { t } = useT("estateDashboard");
  const theme = useTheme();
  const color = toneColor(theme, item.tone);
  const Icon = ICONS[item.code];
  return (
    <ButtonBase
      onClick={onOpen}
      disabled={busy}
      sx={{
        p: 1.5,
        width: "100%",
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        borderLeft: `3px solid ${color}`,
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr)",
        gap: 1,
        alignItems: "start",
        justifyContent: "stretch",
        textAlign: "left",
        opacity: busy ? 0.6 : 1,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: "8px", display: "grid", placeItems: "center", fontSize: "0.9rem", color, bgcolor: alpha(color, 0.12) }}>
        {Icon ? <Icon sx={{ fontSize: 18 }} /> : item.icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.3 }}>{item.title}</Typography>
        {item.text && <Typography sx={{ mt: 0.25, fontSize: "0.8rem", lineHeight: 1.4, color: "text.secondary" }}>{item.text}</Typography>}
        {canAct && (
          <Typography component="span" sx={{ mt: 0.75, display: "inline-flex", alignItems: "center", gap: 0.25, fontSize: "0.8rem", fontWeight: 600, color: "primary.main" }}>
            {t(`focus.action.${item.code}`, { defaultValue: t("focus.action.default") })}
            <ChevronRightOutlined sx={{ fontSize: 16 }} />
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}
