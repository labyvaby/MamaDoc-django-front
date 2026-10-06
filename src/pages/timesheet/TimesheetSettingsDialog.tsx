import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  applyKgHolidayPreset,
  createTimesheetCode,
  createTimesheetHoliday,
  deleteTimesheetCode,
  deleteTimesheetHoliday,
  getTimesheetCodes,
  getTimesheetHolidays,
  getTimesheetSettings,
  updateTimesheetCode,
  updateTimesheetSettings,
  type TimesheetCategory,
  type TimesheetCode,
} from "../../api/timesheet";
import { getErrorCode, getErrorFields } from "../../api/client";
import { SegmentedTabs } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { codeFill, codeInk } from "./codeColors";
import { MONTH_NAMES_GENITIVE } from "./model";

const PALETTE = ["#0ea5e9", "#14b8a6", "#84cc16", "#eab308", "#f97316", "#e11d48", "#d946ef", "#6366f1", "#64748b"];

const CATEGORY_LABEL: Record<TimesheetCategory, string> = {
  work: "Работа — считается явкой",
  leave: "Отсутствие по причине",
  absence: "Неявка",
  rest: "Отдых",
};

type Tab = "codes" | "holidays" | "pay";

export interface TimesheetSettingsDialogProps {
  open: boolean;
  organizationId?: number | null;
  onClose: () => void;
  onChanged: () => void;
}

export const TimesheetSettingsDialog: React.FC<TimesheetSettingsDialogProps> = ({
  open,
  organizationId,
  onClose,
  onChanged,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [tab, setTab] = React.useState<Tab>("codes");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth={false}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : "18px", width: fullScreen ? "100%" : 640, maxWidth: "100%" } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={800}>
              Настройки табеля
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Свои отметки, праздники и оплата работы в праздник
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Box sx={{ mt: 1.5 }}>
          <SegmentedTabs<Tab>
            layoutId="timesheet-settings-tabs"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "codes", label: "Отметки" },
              { key: "holidays", label: "Праздники" },
              { key: "pay", label: "Оплата" },
            ]}
          />
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        {tab === "codes" && <CodesTab organizationId={organizationId} onChanged={onChanged} />}
        {tab === "holidays" && <HolidaysTab organizationId={organizationId} onChanged={onChanged} />}
        {tab === "pay" && <PayTab organizationId={organizationId} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  );
};

// ── Codes ───────────────────────────────────────────────────────────────────

function CodeBadge({ code }: { code: Pick<TimesheetCode, "letter" | "color"> }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        minWidth: 34,
        height: 34,
        px: 0.75,
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: 14,
        color: codeInk(theme, code.color),
        bgcolor: codeFill(theme, code.color, 1.3),
        border: `1px solid ${code.color}55`,
        flexShrink: 0,
      }}
    >
      {code.letter || "?"}
    </Box>
  );
}

function CodesTab({ organizationId, onChanged }: { organizationId?: number | null; onChanged: () => void }) {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const queryKey = ["django", "timesheet", "codes", organizationId ?? null];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getTimesheetCodes(organizationId, signal) });
  const [draft, setDraft] = React.useState({
    letter: "",
    name: "",
    color: PALETTE[0],
    category: "leave" as TimesheetCategory,
    isPaid: false,
    blocksBooking: false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    onChanged();
  };

  const create = async () => {
    setSaving(true);
    setErrors({});
    try {
      await createTimesheetCode(draft, organizationId);
      setDraft((prev) => ({ ...prev, letter: "", name: "" }));
      notify?.({ type: "success", message: "Отметка добавлена" });
      await refresh();
    } catch (error) {
      setErrors(getErrorFields(error) ?? { name: error instanceof Error ? error.message : "Ошибка" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (code: TimesheetCode) => {
    if (code.id == null) return;
    await updateTimesheetCode(code.id, { isActive: !code.isActive }, organizationId);
    await refresh();
  };

  const remove = async (code: TimesheetCode) => {
    if (code.id == null) return;
    try {
      await deleteTimesheetCode(code.id, organizationId);
      notify?.({ type: "success", message: "Отметка удалена" });
      await refresh();
    } catch (error) {
      if (getErrorCode(error) === "CODE_IN_USE") {
        notify?.({ type: "error", message: "Отметка уже стоит в табеле — её можно только скрыть" });
      } else {
        notify?.({ type: "error", message: error instanceof Error ? error.message : "Не удалось" });
      }
    }
  };

  const items = query.data?.items ?? [];
  const system = items.filter((code) => code.isSystem);
  const custom = items.filter((code) => !code.isSystem);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Встроенные
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {system.map((code) => (
            <Tooltip key={code.key} title={code.blocksBooking ? "Закрывает запись клиентов" : ""}>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pr: 1.25, py: 0.5, pl: 0.5, borderRadius: "12px", bgcolor: subtleBg(theme) }}>
                <CodeBadge code={code} />
                <Typography variant="body2" fontWeight={700}>
                  {code.name}
                </Typography>
              </Stack>
            </Tooltip>
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Свои отметки
        </Typography>
        {custom.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Пока нет. Например: «ОТ» — отгул, «ДО» — за свой счёт, «УД» — удалённо.
          </Typography>
        ) : (
          <Stack spacing={0.75} sx={{ mb: 1.5 }}>
            {custom.map((code) => (
              <Stack
                key={code.key}
                direction="row"
                spacing={1.25}
                alignItems="center"
                sx={{ p: 1, borderRadius: "12px", border: 1, borderColor: "divider", opacity: code.isActive ? 1 : 0.55 }}
              >
                <CodeBadge code={code} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={800} noWrap>
                    {code.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {CATEGORY_LABEL[code.category]}
                    {code.isPaid ? " · оплачивается" : ""}
                    {code.blocksBooking ? " · закрывает запись" : ""}
                    {code.isActive ? "" : " · скрыта"}
                  </Typography>
                </Box>
                <Tooltip title={code.isActive ? "Скрыть из выбора" : "Вернуть в выбор"}>
                  <IconButton size="small" onClick={() => void toggleActive(code)}>
                    {code.isActive ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Удалить (только если ещё не использовалась)">
                  <IconButton size="small" onClick={() => void remove(code)}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
        )}

        <Box sx={{ p: 1.5, borderRadius: "14px", bgcolor: subtleBg(theme) }}>
          <Stack direction="row" spacing={1.25} alignItems="flex-start">
            <CodeBadge code={{ letter: draft.letter.toUpperCase(), color: draft.color }} />
            <TextField
              label="Буква"
              size="small"
              value={draft.letter}
              onChange={(e) => setDraft((prev) => ({ ...prev, letter: e.target.value.slice(0, 3) }))}
              error={Boolean(errors.letter)}
              helperText={errors.letter}
              sx={{ width: 96 }}
            />
            <TextField
              label="Название"
              size="small"
              fullWidth
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              error={Boolean(errors.name)}
              helperText={errors.name}
            />
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }}>
            {PALETTE.map((color) => (
              <ButtonBase
                key={color}
                onClick={() => setDraft((prev) => ({ ...prev, color }))}
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  bgcolor: color,
                  outline: draft.color === color ? `2px solid ${color}` : "none",
                  outlineOffset: 2,
                  transition: "transform .12s ease",
                  "&:hover": { transform: "scale(1.12)" },
                }}
                aria-label={`Цвет ${color}`}
              />
            ))}
          </Stack>
          <TextField
            select
            label="Что означает"
            size="small"
            fullWidth
            value={draft.category}
            onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value as TimesheetCategory }))}
            sx={{ mt: 1.5 }}
          >
            {(Object.keys(CATEGORY_LABEL) as TimesheetCategory[]).map((key) => (
              <MenuItem key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.isPaid}
                  onChange={(e) => setDraft((prev) => ({ ...prev, isPaid: e.target.checked }))}
                />
              }
              label="Оплачивается"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.blocksBooking}
                  onChange={(e) => setDraft((prev) => ({ ...prev, blocksBooking: e.target.checked }))}
                />
              }
              label="Закрывает запись клиентов"
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            «Оплачивается» — справочно: в зарплату идут часы, вписанные в ячейку.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            disabled={saving || !draft.letter.trim() || !draft.name.trim()}
            onClick={() => void create()}
            sx={{ mt: 1.5, borderRadius: "10px" }}
          >
            Добавить отметку
          </Button>
        </Box>
      </Box>
    </Stack>
  );
}

// ── Holidays ────────────────────────────────────────────────────────────────

function HolidaysTab({ organizationId, onChanged }: { organizationId?: number | null; onChanged: () => void }) {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const [year, setYear] = React.useState(() => dayjs().year());
  const queryKey = ["django", "timesheet", "holidays", organizationId ?? null, year];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getTimesheetHolidays(year, organizationId, signal) });
  const [date, setDate] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    onChanged();
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await createTimesheetHoliday({ date, name }, organizationId);
      setDate("");
      setName("");
      await refresh();
    } catch (err) {
      const fields = getErrorFields(err);
      setError(fields?.date ?? fields?.name ?? (err instanceof Error ? err.message : "Ошибка"));
    } finally {
      setBusy(false);
    }
  };

  const preset = async () => {
    setBusy(true);
    try {
      const before = query.data?.items.length ?? 0;
      const result = await applyKgHolidayPreset(year, organizationId);
      const added = result.items.length - before;
      notify?.({
        type: "success",
        message: added > 0 ? `Добавлено праздников: ${added}` : "Все праздники КР уже в списке",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await deleteTimesheetHoliday(id, organizationId);
    await refresh();
  };

  const items = query.data?.items ?? [];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton size="small" onClick={() => setYear((y) => y - 1)}>
          <ChevronLeftRounded />
        </IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ minWidth: 64, textAlign: "center" }}>
          {year}
        </Typography>
        <IconButton size="small" onClick={() => setYear((y) => y + 1)}>
          <ChevronRightRounded />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<AutoAwesomeRounded />}
          onClick={() => void preset()}
          disabled={busy}
          sx={{ borderRadius: "10px" }}
        >
          Праздники КР
        </Button>
      </Stack>
      <Alert severity="info" sx={{ borderRadius: "12px" }}>
        Кнопка добавит праздники с постоянной датой. Орозо айт и Курман айт каждый год назначает
        правительство — добавьте их вручную.
      </Alert>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          На {year} год праздников нет.
        </Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 0.75 }}>
          {items.map((holiday) => {
            const d = dayjs(holiday.date);
            return (
              <Stack
                key={holiday.id}
                direction="row"
                spacing={1.25}
                alignItems="center"
                sx={{ p: 1, borderRadius: "12px", border: 1, borderColor: "divider" }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "11px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "#ec489922",
                    color: theme.palette.mode === "dark" ? "#f9a8d4" : "#be185d",
                    flexShrink: 0,
                  }}
                >
                  <Typography sx={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{d.date()}</Typography>
                  <Typography sx={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2 }}>
                    {MONTH_NAMES_GENITIVE[d.month()].slice(0, 3)}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap title={holiday.name}>
                  {holiday.name}
                </Typography>
                <IconButton size="small" onClick={() => void remove(holiday.id)} aria-label="Удалить">
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </Box>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          type="date"
          size="small"
          label="Дата"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="Праздник"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={Boolean(error)}
          helperText={error ?? undefined}
        />
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          disabled={busy || !date || !name.trim()}
          onClick={() => void add()}
          sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
        >
          Добавить
        </Button>
      </Stack>
    </Stack>
  );
}

// ── Pay ─────────────────────────────────────────────────────────────────────

function PayTab({ organizationId, onChanged }: { organizationId?: number | null; onChanged: () => void }) {
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const queryKey = ["django", "timesheet", "settings", organizationId ?? null];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getTimesheetSettings(organizationId, signal) });
  const [percent, setPercent] = React.useState(100);
  const [tolerance, setTolerance] = React.useState(15);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!query.data) return;
    setPercent(query.data.holidayPayPercent);
    setTolerance(query.data.toleranceMinutes);
  }, [query.data]);

  const save = async () => {
    setSaving(true);
    try {
      await updateTimesheetSettings({ holidayPayPercent: percent, toleranceMinutes: tolerance }, organizationId);
      notify?.({ type: "success", message: "Настройки сохранены" });
      await queryClient.invalidateQueries({ queryKey });
      onChanged();
    } catch (error) {
      notify?.({ type: "error", message: error instanceof Error ? error.message : "Не удалось" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle2" fontWeight={800}>
          Работа в праздник
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Часы, отработанные в праздник, оплачиваются по ставке × коэффициент. ×1 — как обычные часы.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          {[100, 150, 200].map((value) => (
            <Button
              key={value}
              variant={percent === value ? "contained" : "outlined"}
              onClick={() => setPercent(value)}
              sx={{ borderRadius: "10px", minWidth: 64 }}
            >
              ×{value / 100}
            </Button>
          ))}
        </Stack>
        <Box sx={{ px: 1 }}>
          <Slider
            value={percent}
            min={100}
            max={300}
            step={10}
            onChange={(_, value) => setPercent(value as number)}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `×${(value / 100).toFixed(1)}`}
          />
        </Box>
        <Box sx={{ p: 1.25, borderRadius: "12px", bgcolor: subtleBg(theme) }}>
          <Typography variant="body2">
            Пример: ставка 100 сом/ч, 8 ч в праздник → <b>{Math.round(800 * (percent / 100))} сом</b>
            {percent > 100 ? ` (доплата ${Math.round(800 * (percent / 100 - 1))} сом)` : ""}
          </Typography>
        </Box>
      </Box>
      <Box>
        <Typography variant="subtitle2" fontWeight={800}>
          Допуск отклонений
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Ушёл раньше или задержался меньше чем на столько минут — табель не отмечает это.
        </Typography>
        <Box sx={{ px: 1 }}>
          <Slider
            value={tolerance}
            min={0}
            max={120}
            step={5}
            marks={[
              { value: 0, label: "0" },
              { value: 15, label: "15" },
              { value: 30, label: "30" },
              { value: 60, label: "60" },
              { value: 120, label: "120 мин" },
            ]}
            onChange={(_, value) => setTolerance(value as number)}
            valueLabelDisplay="auto"
          />
        </Box>
      </Box>
      <Button variant="contained" disabled={saving || !query.data} onClick={() => void save()} sx={{ borderRadius: "10px", alignSelf: "flex-start" }}>
        Сохранить
      </Button>
    </Stack>
  );
}

export default TimesheetSettingsDialog;
