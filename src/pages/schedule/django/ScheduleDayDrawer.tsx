import React from "react";
import { Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import type { Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import { lunchNote, shiftTimeLabel, type DayOccurrence } from "./occurrences";
import { employeeColorHex } from "./employeeColors";
import type { AbsenceMark } from "./absenceRows";

/** Со скольких смен в дне показываем поиск по ФИО. */
const SEARCH_MIN_ROWS = 6;

export interface ScheduleDayDrawerProps {
  open: boolean;
  onClose: () => void;
  day: Dayjs | null;
  occurrences: DayOccurrence[];
  /** Отпуска и выходные этого дня — смен они не порождают. */
  absences?: AbsenceMark[];
  employeesById: Map<number, DjangoEmployeeListItem>;
  employeeColorMap: Map<number, number>;
  canManage: boolean;
  onMarkDayOff: (employeeId: number) => Promise<void>;
  /** Удаление добавленной вручную смены (исключение kind="extra"). */
  onDeleteShift: (exceptionId: number) => Promise<void>;
  /** Редактирование смены только на выбранную дату. */
  onEditOccurrence: (occurrence: DayOccurrence) => void;
  onAddShift: () => void;
}

const ScheduleDayDrawer: React.FC<ScheduleDayDrawerProps> = ({
  open,
  onClose,
  day,
  occurrences,
  absences,
  employeesById,
  employeeColorMap,
  canManage,
  onMarkDayOff,
  onDeleteShift,
  onEditOccurrence,
  onAddShift,
}) => {
  const theme = useTheme();
  // Ключ занятой строки — идентичность смены, а не сотрудник: у одного
  // человека в дне может быть и смена по графику, и добавленная вручную.
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
    } finally {
      setBusyKey(null);
    }
  };

  const sorted = React.useMemo(
    () => [...occurrences].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [occurrences],
  );

  // Поиск по ФИО: в клинике на день выходит несколько десятков смен, и нужного
  // человека искали прокруткой. Фильтр в шапке календаря сюда не доходит —
  // дровер получает уже готовый список занятий дня.
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    if (open) setQuery("");
  }, [open, day]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((occ) => occ.employeeName.toLowerCase().includes(q));
  }, [sorted, query]);

  const absenceList = React.useMemo(
    () => [...(absences ?? [])].sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    [absences],
  );
  const visibleAbsences = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return absenceList;
    return absenceList.filter((m) => m.employeeName.toLowerCase().includes(q));
  }, [absenceList, query]);

  // На коротком списке поле только съедает высоту — искать там нечего.
  const showSearch = sorted.length + absenceList.length >= SEARCH_MIN_ROWS;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, maxWidth: "100%" } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 1.5 }}>
        <Typography variant="h6" fontWeight={600}>
          {day ? day.format("D MMMM") : ""}
        </Typography>
        <IconButton onClick={onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      {/* Поле над лентой, а не внутри неё: при прокрутке списка запрос остаётся
          на виду вместе со счётчиком найденных. */}
      {showSearch && (
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <TextField
            size="small"
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по ФИО..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 16, color: "text.disabled" }} />
                </InputAdornment>
              ),
            }}
          />
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
            {query.trim()
              ? `Найдено: ${visible.length + visibleAbsences.length} из ${
                  sorted.length + absenceList.length
                }`
              : `Сотрудников в смене: ${sorted.length}${
                  absenceList.length > 0 ? ` · отсутствуют: ${absenceList.length}` : ""
                }`}
          </Typography>
        </Box>
      )}

      <Box sx={{ px: 2.5, pt: showSearch ? 0.5 : 2.5, pb: 2.5, flex: 1, overflowY: "auto" }}>
        {sorted.length === 0 && absenceList.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>
            Нет смен на этот день
          </Typography>
        ) : visible.length === 0 && visibleAbsences.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>
            Никого не нашли по запросу «{query.trim()}»
          </Typography>
        ) : (
          <Stack spacing={1}>
            {visible.map((occ) => {
              const employee = employeesById.get(occ.employeeId);
              const occKey = `${occ.kind}_${occ.sourceId}_${occ.startTime}`;
              const busy = busyKey === occKey;
              const isExtra = occ.kind === "extra" || occ.kind === "override";
              return (
                <Box
                  key={occKey}
                  sx={{
                    p: 1.5,
                    borderRadius: "10px",
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                  }}
                >
                  <UserAvatar
                    name={occ.employeeName}
                    src={employee?.photoUrl}
                    size={38}
                    sx={{
                      border: `2px solid ${employeeColorHex(
                        // ?? id — сотрудника может не быть в справочнике (см. resourceRows).
                        employeeColorMap.get(occ.employeeId) ?? occ.employeeId,
                        theme.palette.mode,
                      )}`,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {occ.employeeName}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {shiftTimeLabel(occ)}
                      </Typography>
                      {isExtra && (
                        <Chip
                          label={occ.kind === "override" ? "Изменено на день" : "Смена"}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                    {/* Обед — отдельной строкой: в строку со временем и чипом
                        он не влезал и наезжал на кнопки действий. */}
                    {occ.lunch && (
                      <Tooltip title={lunchNote(occ)} arrow placement="bottom-start">
                        <Stack
                          direction="row"
                          spacing={0.25}
                          alignItems="center"
                          sx={{ width: "fit-content" }}
                        >
                          <RestaurantOutlined sx={{ fontSize: 13, color: "error.onSurface" }} />
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: "error.onSurface", fontWeight: 600 }}
                          >
                            {occ.lunch.start}–{occ.lunch.end}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    )}
                  </Box>
                  {canManage && (
                    <Stack direction="row" spacing={0.25} alignItems="center">
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<EditOutlined fontSize="small" />}
                        disabled={busy}
                        onClick={() => onEditOccurrence(occ)}
                        sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                      >
                        Изменить
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="text"
                        startIcon={
                          busy ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : isExtra ? (
                            <DeleteOutline fontSize="small" />
                          ) : (
                            <EventBusyOutlined fontSize="small" />
                          )
                        }
                        disabled={busy}
                        onClick={() =>
                          isExtra
                            ? runAction(occKey, () => onDeleteShift(occ.sourceId))
                            : runAction(occKey, () => onMarkDayOff(occ.employeeId))
                        }
                        sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                      >
                        {isExtra ? "Удалить" : "Выходной"}
                      </Button>
                    </Stack>
                  )}
                </Box>
              );
            })}

            {/* Отсутствия — тем же списком, но пунктиром и приглушённо: это не
                смена, а закрытый день (или его часть). */}
            {visibleAbsences.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ pt: 1 }}>
                Отсутствуют
              </Typography>
            )}
            {visibleAbsences.map((mark) => (
              <Box
                key={mark.id}
                sx={{
                  p: 1.5,
                  borderRadius: "10px",
                  border: "1px dashed",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <UserAvatar
                  name={mark.employeeName}
                  src={employeesById.get(mark.employeeId)?.photoUrl}
                  size={38}
                  sx={{ opacity: 0.55 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" color="text.secondary" noWrap>
                    {mark.employeeName}
                  </Typography>
                  <Typography variant="body2" color="text.disabled" noWrap>
                    {mark.startTime && mark.endTime
                      ? `${mark.startTime}–${mark.endTime}`
                      : "весь день"}
                    {mark.comment ? ` · ${mark.comment}` : ""}
                  </Typography>
                </Box>
                <Chip
                  label={mark.label}
                  size="small"
                  variant="outlined"
                  sx={{ flexShrink: 0 }}
                />
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {canManage && (
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button fullWidth variant="contained" size="large" startIcon={<AddOutlined />} onClick={onAddShift}>
            Добавить смену на этот день
          </Button>
        </Box>
      )}
    </Drawer>
  );
};

export default ScheduleDayDrawer;
