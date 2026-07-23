/**
 * PatientHistoryPanel.tsx
 * Компонент отображает среднюю колонку с истории приемов выбранного пациента.
 * Состояния:
 *  - Если пациент не выбран — показывает подсказку
 *  - Загрузка / ошибка
 *  - Список приемов с навигацией к карточке приема
 * Презентационный компонент: не содержит API-логики, принимает данные через пропсы.
 */
import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import { AppCard, ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { formatKGS } from "../../../utility/format";
import type { HistoryRow } from "../../../types/models";

type Props = {
  selected: boolean;
  loading: boolean;
  errorMsg: string | null;
  history: HistoryRow[];
  onClick: (row: HistoryRow) => void;
};

type FilterType = "all" | "doctor" | "procedure";

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "doctor", label: "Врачи" },
  { key: "procedure", label: "Процедуры" },
];

/** Тонированная плашка статуса приёма — точка-индикатор + текст, тон из токенов
 *  темы (success/warning), а не заливка по умолчанию. См. ui-style-guide.md §5.5. */
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const tone = status === "Оплачено" ? "success" : status === "Ожидаем" ? "warning" : null;
  return (
    <Chip
      size="small"
      label={status}
      icon={
        tone ? (
          <Box
            component="span"
            sx={(t) => ({
              width: 6,
              height: 6,
              borderRadius: "50%",
              ml: 0.75,
              bgcolor: tone === "success" ? t.palette.success.main : t.palette.warning.main,
            })}
          />
        ) : undefined
      }
      sx={(t) => ({
        height: 22,
        borderRadius: "7px",
        fontSize: "0.72rem",
        fontWeight: 500,
        "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
        color: tone
          ? t.palette.mode === "dark"
            ? (tone === "success" ? t.palette.success.light : t.palette.warning.light)
            : (tone === "success" ? t.palette.success.dark : t.palette.warning.dark)
          : "text.secondary",
        bgcolor: tone
          ? alpha(tone === "success" ? t.palette.success.main : t.palette.warning.main, t.palette.mode === "dark" ? 0.2 : 0.14)
          : subtleBg(t, true),
      })}
    />
  );
};

const PatientHistoryPanel: React.FC<Props> = ({
  selected,
  loading,
  errorMsg,
  history,
  onClick,
}) => {
  const [filter, setFilter] = React.useState<FilterType>("all");

  const filtered = React.useMemo(() => {
    if (filter === "all") return history;
    return history.filter((h) => (h.appointment_type ?? "doctor") === filter);
  }, [history, filter]);

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ mb: 1.25 }}>
              <Stack direction="row" alignItems="center" gap={1.25}>
                <HistoryOutlined color="primary" />
                <Typography variant="h6">История приемов</Typography>
              </Stack>
              {selected && !loading && !errorMsg && (
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {filtered.length}
                </Typography>
              )}
            </Stack>
            <SegmentedTabs
              layoutId="patient-history-filter"
              tabs={FILTER_TABS}
              value={filter}
              onChange={setFilter}
            />
          </Box>
        }
        disableContentPadding
        sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box sx={{ borderTop: 1, borderColor: "divider", flex: 1, overflowY: "auto", minHeight: 0, p: 1 }}>
          {!selected ? (
            <ListEmptyState
              icon={<HistoryOutlined />}
              title="Пациент не выбран"
              description="Выберите пациента слева, чтобы увидеть историю приёмов"
            />
          ) : loading ? (
            <ListLoadingSkeleton rows={5} />
          ) : errorMsg ? (
            <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить" description={errorMsg} />
          ) : filtered.length === 0 ? (
            <ListEmptyState
              icon={<EventBusyOutlined />}
              title={history.length === 0 ? "История пуста" : "Нет записей"}
              description={history.length === 0 ? "У пациента ещё не было приёмов" : "Нет записей по выбранному фильтру"}
            />
          ) : (
            <Stack spacing={0.75}>
              {filtered.map((h) => (
                <Box
                  key={h.ID}
                  role="button"
                  tabIndex={0}
                  onClick={() => onClick(h)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClick(h);
                    }
                  }}
                  sx={(t) => ({
                    p: 1.5,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(t),
                    cursor: "pointer",
                    transition: "background-color .15s ease, border-color .15s ease",
                    "&:hover": {
                      bgcolor: subtleBg(t, true),
                      borderColor: alpha(t.palette.primary.main, 0.28),
                    },
                  })}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                    <Stack sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {h["Дата и время"]}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {h.appointment_type === "procedure" ? "Медсестра" : "Врач"}: {h["Доктор ФИО"] || "—"}
                      </Typography>
                      {h["Услуга"] && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          Услуга: {h["Услуга"]}
                        </Typography>
                      )}
                    </Stack>
                    <Stack alignItems="flex-end" flexShrink={0} spacing={0.5}>
                      {(typeof h["Итого, сом"] !== "undefined" || typeof h["Стоимость"] !== "undefined") && (
                        <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatKGS(h["Итого, сом"] ?? h["Стоимость"] ?? 0)}
                        </Typography>
                      )}
                      {h.Статус && <StatusChip status={h.Статус} />}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </AppCard>
    </Box>
  );
};

export default PatientHistoryPanel;
