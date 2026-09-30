/**
 * «Снят с продажи» в карточке номера (RoomDetailsDialog): закрыть номер на
 * даты без брони — ремонт, обслуживание, придержать для своих — и вернуть
 * обратно. Бэк: POST /hotel/room-blocks/ и DELETE /hotel/room-blocks/{id}/
 * (право hotel.manage). В шахматке такие ночи — серая штриховка, на них
 * нельзя поставить бронь.
 *
 * В форме — первая и последняя ночь включительно, как говорят люди («с 5-го
 * по 7-е»). Бэку уходит dateTo = последняя ночь + 1 — у блока та же
 * полуоткрытая граница, что у выезда брони.
 *
 * Бессрочный блок (dateTo = 9999-12-31) бэк ставит сам, когда номер выводят
 * из продажи статусом в карточке номера. Снимать его здесь нельзя: статус
 * номера остался бы «выведен», а история отчётов потеряла бы эти ночи, —
 * поэтому у него вместо кнопки подсказка: снимается выходом из «Ремонта».
 *
 * Бэк откажет (409), если в номере на эти даты бронь или категория продана
 * полностью и блок сделал бы овербукинг — текст отказа показываем как есть.
 */
import React from "react";
import { Alert, Box, Button, Chip, Collapse, Stack, TextField, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { useCan } from "../hooks/useCan";
import { subtleBg } from "../theme/uiHelpers";
import { createRoomBlock, releaseRoomBlock, type HotelRoomBlock } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { formatHotelDate, formatHotelDateRange, nightsBetween } from "./mockDemoData";
import { plural } from "./hotelUi";

/** Блок без даты окончания — от статуса номера «выведен из продажи». */
const isOpenEnded = (b: HotelRoomBlock) => b.dateTo.startsWith("9999");

const REASONS = ["Ремонт", "Техническое обслуживание", "Придержать для своих"] as const;
const OTHER = "Другое";

export interface RoomBlocksSectionProps {
  roomId: number;
  roomNumber: string;
  blocks: HotelRoomBlock[];
}

export const RoomBlocksSection: React.FC<RoomBlocksSectionProps> = ({ roomId, roomNumber, blocks }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("hotel.manage");

  const [formOpen, setFormOpen] = React.useState(false);
  const [firstNight, setFirstNight] = React.useState<Dayjs | null>(() => dayjs().startOf("day"));
  const [lastNight, setLastNight] = React.useState<Dayjs | null>(() => dayjs().startOf("day"));
  const [reason, setReason] = React.useState<string>(REASONS[0]);
  const [otherReason, setOtherReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [releasingId, setReleasingId] = React.useState<number | null>(null);

  // Другой номер — форма с нуля.
  React.useEffect(() => {
    setFormOpen(false);
    setError(null);
  }, [roomId]);

  const active = blocks.filter((b) => b.isActive).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "room-availability", roomId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reports"] });
  };

  const today = dayjs().startOf("day");
  const effectiveReason = reason === OTHER ? otherReason.trim() : reason;
  const datesError =
    !firstNight || !lastNight || !firstNight.isValid() || !lastNight.isValid()
      ? "Укажите обе даты"
      : lastNight.isBefore(firstNight, "day")
        ? "Последняя ночь раньше первой"
        : firstNight.isBefore(today, "day")
          ? "Прошедшие ночи закрыть нельзя"
          : null;
  const reasonError = effectiveReason ? null : "Напишите причину";
  const nights = !datesError && firstNight && lastNight ? lastNight.diff(firstNight, "day") + 1 : 0;

  const openForm = () => {
    setFirstNight(today);
    setLastNight(today);
    setReason(REASONS[0]);
    setOtherReason("");
    setError(null);
    setFormOpen(true);
  };

  const handleCreate = async () => {
    if (datesError || reasonError || !firstNight || !lastNight) return;
    setSaving(true);
    setError(null);
    try {
      await createRoomBlock({
        roomId,
        dateFrom: firstNight.format("YYYY-MM-DD"),
        dateTo: lastNight.add(1, "day").format("YYYY-MM-DD"),
        reason: effectiveReason,
      });
      invalidate();
      setFormOpen(false);
      enqueueSnackbar(`Номер ${roomNumber} снят с продажи на ${nights} ${plural(nights, "ночь", "ночи", "ночей")}`, {
        variant: "success",
      });
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось снять номер с продажи"));
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = async (block: HotelRoomBlock) => {
    setReleasingId(block.id);
    try {
      await releaseRoomBlock(block.id);
      invalidate();
      enqueueSnackbar(`Номер ${roomNumber} снова в продаже`, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось вернуть номер в продажу"), { variant: "error" });
    } finally {
      setReleasingId(null);
    }
  };

  if (active.length === 0 && !canManage) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.25 }}>
        <Typography
          component="div"
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
        >
          Снят с продажи
        </Typography>
        {canManage && !formOpen && (
          <Button size="small" startIcon={<BlockOutlined />} onClick={openForm}>
            Закрыть на даты
          </Button>
        )}
      </Stack>

      {active.length === 0 && !formOpen && (
        <Typography variant="body2" color="text.secondary">
          Номер в продаже. Закройте его на даты ремонта — бронь на них поставить будет нельзя.
        </Typography>
      )}

      {active.length > 0 && (
        <Stack gap={0.75}>
          {active.map((b) => (
            <Stack
              key={b.id}
              direction="row"
              alignItems="center"
              gap={1.25}
              sx={{ px: 1.5, py: 1, borderRadius: "10px", bgcolor: subtleBg(theme) }}
            >
              <BuildOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {b.reason || "Снят с продажи"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {isOpenEnded(b) ? (
                    <>С {formatHotelDate(b.dateFrom)}, без даты окончания · вернётся в продажу, когда номер выйдет из состояния «Ремонт»</>
                  ) : (
                    <>
                      {formatHotelDateRange(b.dateFrom, b.dateTo)} · {nightsBetween(b.dateFrom, b.dateTo)}{" "}
                      {plural(nightsBetween(b.dateFrom, b.dateTo), "ночь", "ночи", "ночей")}
                    </>
                  )}
                </Typography>
              </Box>
              {canManage && !isOpenEnded(b) && (
                <Button size="small" onClick={() => void handleRelease(b)} disabled={releasingId != null} sx={{ flexShrink: 0 }}>
                  {releasingId === b.id ? "Возвращаем…" : "Вернуть в продажу"}
                </Button>
              )}
            </Stack>
          ))}
        </Stack>
      )}

      <Collapse in={formOpen} unmountOnExit>
        <Stack gap={1.5} sx={{ mt: active.length > 0 ? 1.5 : 0, p: 1.75, borderRadius: "12px", border: 1, borderColor: "divider" }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <CustomDatePicker
              label="Первая ночь"
              value={firstNight}
              minDate={today}
              onChange={(d) => {
                const next = d as Dayjs | null;
                setFirstNight(next);
                if (next && lastNight && lastNight.isBefore(next, "day")) setLastNight(next);
              }}
              disabled={saving}
              sx={{ flex: 1 }}
            />
            <CustomDatePicker
              label="Последняя ночь"
              value={lastNight}
              minDate={firstNight ?? today}
              onChange={(d) => setLastNight(d as Dayjs | null)}
              disabled={saving}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {[...REASONS, OTHER].map((r) => (
              <Chip
                key={r}
                label={r}
                size="small"
                color={reason === r ? "primary" : "default"}
                variant={reason === r ? "filled" : "outlined"}
                onClick={() => setReason(r)}
                disabled={saving}
              />
            ))}
          </Stack>
          {reason === OTHER && (
            <TextField
              size="small"
              label="Причина"
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value.slice(0, 120))}
              disabled={saving}
              error={otherReason !== "" && reasonError != null}
              autoFocus
              fullWidth
            />
          )}
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
            <Typography variant="caption" color={datesError ? "error" : "text.secondary"}>
              {datesError ?? `${nights} ${plural(nights, "ночь", "ночи", "ночей")} без продажи`}
            </Typography>
            <Stack direction="row" gap={1}>
              <Button size="small" onClick={() => setFormOpen(false)} disabled={saving}>
                Отмена
              </Button>
              <Button
                size="small"
                variant="contained"
                disableElevation
                onClick={() => void handleCreate()}
                disabled={saving || datesError != null || reasonError != null}
              >
                {saving ? "Закрываем…" : "Снять с продажи"}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Collapse>
    </Box>
  );
};

export default RoomBlocksSection;
