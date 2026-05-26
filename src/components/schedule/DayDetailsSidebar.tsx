/**
 * DayDetailsSidebar.tsx
 * Боковая панель для просмотра списка смен на выбранный день и управления ими (удаление).
 * Источник данных: таблица Shifts (Supabase).
 * Формат времени: HH:mm (строки), дата: YYYY-MM-DD.
 */
import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EmployeeAvatar from "../ui/EmployeeAvatar";
import { supabase } from "../../utility/supabaseClient";
import { useNotification } from "@refinedev/core";

type ShiftRow = {
  id: string;
  employee_id?: string; // нормализовано: в БД может быть employes_id
  employes_id?: string;
  shift_date: string; // YYYY-MM-DD
  start_time?: string | null; // HH:mm
  end_time?: string | null; // HH:mm
  employes?: {
    full_name?: string | null;
  } | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  date: Date | null;
  onChanged?: () => void; // колбэк после удаления для обновления календаря
};

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DayDetailsSidebar: React.FC<Props> = ({ isOpen, onClose, date, onChanged }) => {
  const { open: notify } = useNotification();
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [shifts, setShifts] = React.useState<ShiftRow[]>([]);

  const ymd = date ? toYMD(date) : null;

  const load = React.useCallback(async () => {
    if (!ymd) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const { data, error } = await supabase
        .from("shifts")
        .select("id, shift_date, start_time, end_time, employes_id, employes:employes_id(full_name)")
        .eq("shift_date", ymd)
        .order("start_time", { ascending: true });
      if (error) throw error;
      setShifts((data ?? []) as ShiftRow[]);
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg =
        typeof e === "object" &&
        e !== null &&
        "message" in (e as Record<string, unknown>)
          ? String((e as { message?: unknown }).message)
          : String(e);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [ymd]);

  React.useEffect(() => {
    if (isOpen && ymd) {
      void load();
    }
  }, [isOpen, ymd, load]);

  const handleDelete = async (id: string) => {
    try {
      setBusy(true);
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
      await load();
      onChanged?.();
      notify?.({ type: "success", message: "Смена удалена" });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      notify?.({ type: "error", message: "Не удалось удалить смену" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 420, md: "36vw" }, maxWidth: "100vw" } }}
    >
      <Box sx={{ width: 1, minWidth: 0 }}>
        {/* Заголовок */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
          <Typography variant="h6">
            Смены на {ymd ?? "—"}
          </Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        {/* Содержимое */}
        <Box px={2} py={2}>
          {loading ? (
            <Stack direction="row" alignItems="center" gap={1}>
              <CircularProgress size={18} />
              <Typography variant="body2">Загрузка…</Typography>
            </Stack>
          ) : errorMsg ? (
            <Typography color="error" variant="body2">Ошибка: {errorMsg}</Typography>
          ) : !ymd ? (
            <Typography variant="body2" color="text.secondary">Выберите дату в календаре</Typography>
          ) : shifts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Смен нет</Typography>
          ) : (
            <List dense>
              {shifts.map((s) => (
                <ListItem key={s.id} sx={{ border: "1px solid", borderColor: "divider", mb: 1, borderRadius: 1 }}>
                  <Stack direction="row" alignItems="center" gap={1} sx={{ mr: 2 }}>
                    <EmployeeAvatar name={s.employes?.full_name ?? undefined} size={28} />
                  </Stack>
                  <ListItemText
                    primary={s.employes?.full_name || s.employee_id || s.employes_id}
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {s.start_time || "—"} — {s.end_time || "—"}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Button
                      onClick={() => handleDelete(s.id)}
                      color="error"
                      size="small"
                      startIcon={<DeleteOutline />}
                      disabled={busy}
                    >
                      Убрать из смены
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default DayDetailsSidebar;
