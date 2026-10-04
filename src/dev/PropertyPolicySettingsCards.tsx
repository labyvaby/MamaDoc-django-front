/**
 * Настройки объекта из r3/r4 бэкенда (docs/hotel-backend-r3-frontend.md, r4):
 * ночной аудит, сколько держать заявку с сайта, условия отмены и предоплаты,
 * пределы графика персонала. Каждая карточка сохраняет только свои поля —
 * как «Реквизиты»: правка одной не трогает несохранённое в другой. Пока в
 * ответе объекта нет поля, карточка говорит об этом и не даёт сохранять.
 */
import React from "react";
import { Alert, Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { updateHotelProperty, type HotelCancellationPenaltyKind, type HotelProperty, type HotelPropertyUpdateData } from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { cancellationPolicyPreview } from "./cancellationPolicy";

const hhmm = (raw: string | null | undefined) => (raw ?? "").slice(0, 5);
const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function useSaveProperty(property: HotelProperty) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [saving, setSaving] = React.useState(false);
  const save = async (patch: HotelPropertyUpdateData, done: string) => {
    setSaving(true);
    try {
      await updateHotelProperty(property.id, patch);
      await queryClient.invalidateQueries({ queryKey: ["hotel", "properties"] });
      enqueueSnackbar(done, { variant: "success" });
      return true;
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить"), { variant: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

const CardHead: React.FC<{ id: string; title: string; hint: React.ReactNode }> = ({ id, title, hint }) => (
  <Box id={id} sx={{ scrollMarginTop: 16 }}>
    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
      {title}
    </Typography>
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
      {hint}
    </Typography>
  </Box>
);

const NotSupported: React.FC = () => (
  <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
    Сервер пока без этой настройки — она заработает после его обновления.
  </Alert>
);

// ── Ночной аудит ──────────────────────────────────────────────────────────

export const NightAuditSettingsCard: React.FC<{ property: HotelProperty }> = ({ property }) => {
  const canManage = useCan("hotel.manage");
  const supported = "autoNoShow" in property;
  const { save, saving } = useSaveProperty(property);
  const [on, setOn] = React.useState(!!property.autoNoShow);
  const [time, setTime] = React.useState(hhmm(property.nightAuditTime) || "03:00");
  React.useEffect(() => {
    setOn(!!property.autoNoShow);
    setTime(hhmm(property.nightAuditTime) || "03:00");
  }, [property.autoNoShow, property.nightAuditTime]);
  const dirty = on !== !!property.autoNoShow || time !== (hhmm(property.nightAuditTime) || "03:00");
  const disabled = !canManage || !supported || saving;
  return (
    <Box>
      <CardHead
        id="night-audit"
        title="Ночной аудит"
        hint="Раз в сутки сервер переводит в «Незаезд» брони, гость которых так и не заселился, — номер возвращается в продажу, бронь перестаёт быть долгом. Брони из нескольких номеров, где часть уже заехала, оставляет вам."
      />
      {!supported && <NotSupported />}
      <Stack direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "center" }}>
        <FormControlLabel
          control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} disabled={disabled} />}
          label="Закрывать незаезды автоматически"
          sx={{ flex: 1 }}
        />
        <TextField
          label="Время аудита"
          type="time"
          size="small"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={disabled || !on}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="по часам отеля"
          sx={{ width: 180 }}
        />
      </Stack>
      {on && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Включили днём — аудит сработает в ближайшую ночь. Кнопка «Закрыть день» на ресепшене остаётся.
        </Typography>
      )}
      <Button variant="contained" sx={{ mt: 2 }} disabled={!dirty || disabled} onClick={() => void save({ autoNoShow: on, nightAuditTime: time }, "Ночной аудит сохранён")}>
        {saving ? "Сохранение…" : "Сохранить"}
      </Button>
    </Box>
  );
};

// ── Сколько держать заявку с сайта ────────────────────────────────────────

export const WebsiteHoldSettingsCard: React.FC<{ property: HotelProperty }> = ({ property }) => {
  const canManage = useCan("hotel.manage");
  const supported = "websiteHoldMinutes" in property;
  const { save, saving } = useSaveProperty(property);
  const initMinutes = String(property.websiteHoldMinutes ?? 30);
  const initUntil = hhmm(property.websiteHoldUntil);
  const [minutes, setMinutes] = React.useState(initMinutes);
  const [until, setUntil] = React.useState(initUntil);
  React.useEffect(() => {
    setMinutes(initMinutes);
    setUntil(initUntil);
  }, [initMinutes, initUntil]);
  const minutesNum = Number(minutes);
  const minutesError = !Number.isInteger(minutesNum) || minutesNum < 5 || minutesNum > 1440 ? "От 5 до 1440 минут" : null;
  const dirty = minutes !== initMinutes || until !== initUntil;
  const disabled = !canManage || !supported || saving;
  return (
    <Box>
      <CardHead
        id="website-hold"
        title="Заявка с сайта"
        hint="Номер из заявки держится за гостем, пока администратор её не подтвердит; потом возвращается в продажу. Ночную заявку можно держать до утра, чтобы её успели увидеть."
      />
      {!supported && <NotSupported />}
      <Stack direction={{ xs: "column", md: "row" }} gap={2}>
        <TextField
          label="Держать заявку"
          size="small"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 4))}
          disabled={disabled}
          error={minutesError != null}
          helperText={minutesError ?? "минут"}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          sx={{ width: { md: 180 } }}
        />
        <TextField
          label="Ночную заявку держать до"
          type="time"
          size="small"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={until ? "заявка за 12 ч до этого времени держится до него" : "не задано"}
          sx={{ width: { md: 240 } }}
        />
        {until && (
          <Button size="small" color="inherit" onClick={() => setUntil("")} disabled={disabled} sx={{ alignSelf: { md: "flex-start" }, mt: { md: 0.5 } }}>
            Убрать
          </Button>
        )}
      </Stack>
      {until && !minutesError && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Например: заявка в 23:40 держится до {until}, заявка днём — {minutesNum} мин.
        </Typography>
      )}
      <Button
        variant="contained"
        sx={{ mt: 2 }}
        disabled={!dirty || disabled || minutesError != null}
        onClick={() => void save({ websiteHoldMinutes: minutesNum, websiteHoldUntil: until || null }, "Время удержания заявки сохранено")}
      >
        {saving ? "Сохранение…" : "Сохранить"}
      </Button>
    </Box>
  );
};

// ── Условия отмены и предоплаты ───────────────────────────────────────────

const PENALTY_LABELS: Record<HotelCancellationPenaltyKind, string> = {
  none: "Без штрафа",
  first_night: "Стоимость первой ночи",
  percent: "Процент от стоимости",
  amount: "Фиксированная сумма",
};

export const CancellationTermsSettingsCard: React.FC<{ property: HotelProperty }> = ({ property }) => {
  const canManage = useCan("hotel.manage");
  const supported = "cancellationPenalty" in property;
  const { save, saving } = useSaveProperty(property);
  const init = React.useMemo(
    () => ({
      freeDays: property.freeCancellationDays == null ? "" : String(property.freeCancellationDays),
      penalty: (property.cancellationPenalty ?? "none") as HotelCancellationPenaltyKind,
      penaltyValue: property.cancellationPenaltyValue == null ? "" : String(Number(property.cancellationPenaltyValue)),
      prepaymentPercent: property.prepaymentPercent == null ? "" : String(Number(property.prepaymentPercent)),
      prepaymentHours: property.prepaymentHours == null ? "" : String(property.prepaymentHours),
    }),
    [property.freeCancellationDays, property.cancellationPenalty, property.cancellationPenaltyValue, property.prepaymentPercent, property.prepaymentHours],
  );
  const [form, setForm] = React.useState(init);
  React.useEffect(() => setForm(init), [init]);
  const set = (k: keyof typeof init, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const needsValue = form.penalty === "percent" || form.penalty === "amount";
  const valueNum = Number(form.penaltyValue.replace(",", "."));
  const errors = {
    freeDays: form.freeDays !== "" && Number(form.freeDays) > 365 ? "Не больше 365" : null,
    penaltyValue: needsValue && (form.penaltyValue === "" || !(valueNum > 0)) ? "Укажите размер" : form.penalty === "percent" && valueNum > 100 ? "Не больше 100 %" : null,
    prepaymentPercent: form.prepaymentPercent !== "" && Number(form.prepaymentPercent) > 100 ? "Не больше 100 %" : null,
    prepaymentHours: form.prepaymentHours !== "" && (Number(form.prepaymentHours) < 1 || Number(form.prepaymentHours) > 720) ? "От 1 до 720 ч" : null,
  };
  const invalid = Object.values(errors).some((e) => e != null);
  const dirty = (Object.keys(init) as (keyof typeof init)[]).some((k) => form[k] !== init[k]);
  const disabled = !canManage || !supported || saving;
  const preview = cancellationPolicyPreview({
    freeDays: intOrNull(form.freeDays),
    penalty: form.penalty,
    penaltyValue: form.penaltyValue,
    prepaymentPercent: form.prepaymentPercent,
    prepaymentHours: intOrNull(form.prepaymentHours),
    currency: property.currency || "KGS",
  });
  const submit = () =>
    void save(
      {
        freeCancellationDays: intOrNull(form.freeDays),
        cancellationPenalty: form.penalty,
        cancellationPenaltyValue: needsValue ? String(valueNum) : null,
        prepaymentPercent: form.prepaymentPercent === "" ? null : form.prepaymentPercent,
        prepaymentHours: intOrNull(form.prepaymentHours),
      },
      "Условия отмены сохранены — гость увидит их на сайте, в брони они запомнятся",
    );
  return (
    <Box>
      <CardHead
        id="cancellation"
        title="Условия отмены и предоплаты"
        hint="Показываются гостю на сайте и запоминаются в каждой новой брони. В диалоге отмены ресепшен увидит штраф на сегодня — начислять его или нет, решает администратор."
      />
      {!supported && <NotSupported />}
      <Stack gap={2}>
        <Stack direction={{ xs: "column", md: "row" }} gap={2}>
          <TextField
            label="Бесплатная отмена за"
            size="small"
            value={form.freeDays}
            onChange={(e) => set("freeDays", e.target.value.replace(/\D/g, "").slice(0, 3))}
            disabled={disabled}
            error={errors.freeDays != null}
            helperText={errors.freeDays ?? (form.freeDays === "" ? "пусто — штраф с момента брони" : form.freeDays === "0" ? "до дня заезда" : "суток до заезда")}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            sx={{ flex: 1 }}
          />
          <TextField select label="Штраф за позднюю отмену и незаезд" size="small" value={form.penalty} onChange={(e) => set("penalty", e.target.value)} disabled={disabled} sx={{ flex: 1.4 }}>
            {(Object.keys(PENALTY_LABELS) as HotelCancellationPenaltyKind[]).map((k) => (
              <MenuItem key={k} value={k}>
                {PENALTY_LABELS[k]}
              </MenuItem>
            ))}
          </TextField>
          {needsValue && (
            <TextField
              label={form.penalty === "percent" ? "Процент" : "Сумма"}
              size="small"
              value={form.penaltyValue}
              onChange={(e) => set("penaltyValue", e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
              disabled={disabled}
              error={errors.penaltyValue != null}
              helperText={errors.penaltyValue ?? (form.penalty === "percent" ? "%" : property.currency === "KGS" || !property.currency ? "сом" : property.currency)}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              sx={{ flex: 0.8 }}
            />
          )}
        </Stack>
        <Stack direction={{ xs: "column", md: "row" }} gap={2}>
          <TextField
            label="Предоплата"
            size="small"
            value={form.prepaymentPercent}
            onChange={(e) => set("prepaymentPercent", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            disabled={disabled}
            error={errors.prepaymentPercent != null}
            helperText={errors.prepaymentPercent ?? "% — пусто, если не нужна"}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Внести в течение"
            size="small"
            value={form.prepaymentHours}
            onChange={(e) => set("prepaymentHours", e.target.value.replace(/\D/g, "").slice(0, 3))}
            disabled={disabled || form.prepaymentPercent === "" || form.prepaymentPercent === "0"}
            error={errors.prepaymentHours != null}
            helperText={errors.prepaymentHours ?? "часов после бронирования"}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            sx={{ flex: 1 }}
          />
        </Stack>
        <Box sx={{ p: 2, borderRadius: "12px", border: 1, borderColor: "divider" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 0.75 }}>
            {dirty ? "Гость увидит после сохранения" : "Так видит гость"}
          </Typography>
          <Typography variant="body2" color={(dirty ? preview : property.cancellationPolicyText) ? "text.primary" : "text.secondary"}>
            {(dirty ? preview : property.cancellationPolicyText || preview) || "Условия не заданы — на сайте: «условия подтвердит администратор»."}
          </Typography>
        </Box>
      </Stack>
      <Button variant="contained" sx={{ mt: 2 }} disabled={!dirty || disabled || invalid} onClick={submit}>
        {saving ? "Сохранение…" : "Сохранить условия"}
      </Button>
    </Box>
  );
};

// ── Пределы графика персонала ─────────────────────────────────────────────

export const RosterLimitsSettingsCard: React.FC<{ property: HotelProperty }> = ({ property }) => {
  const canManage = useCan("hotel.manage");
  const supported = "rosterMaxHoursInRow" in property;
  const { save, saving } = useSaveProperty(property);
  const initHours = String(property.rosterMaxHoursInRow ?? 24);
  const initDays = String(property.rosterMaxDaysInRow ?? 6);
  const [hours, setHours] = React.useState(initHours);
  const [days, setDays] = React.useState(initDays);
  React.useEffect(() => {
    setHours(initHours);
    setDays(initDays);
  }, [initHours, initDays]);
  const hoursError = !(Number(hours) >= 1 && Number(hours) <= 168) ? "От 1 до 168" : null;
  const daysError = !(Number(days) >= 1 && Number(days) <= 60) ? "От 1 до 60" : null;
  const dirty = hours !== initHours || days !== initDays;
  const disabled = !canManage || !supported || saving;
  return (
    <Box>
      <CardHead
        id="roster-limits"
        title="График персонала: переработки"
        hint="При сохранении графика вы увидите предупреждение, если человек работает дольше или без выходных. Сохранять оно не мешает. Смены считаются по всем объектам организации."
      />
      {!supported && <NotSupported />}
      <Stack direction={{ xs: "column", md: "row" }} gap={2}>
        <TextField
          label="Не больше часов подряд"
          size="small"
          value={hours}
          onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 3))}
          disabled={disabled}
          error={hoursError != null}
          helperText={hoursError ?? "смены с перерывом меньше 8 ч — одна"}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          sx={{ flex: 1 }}
        />
        <TextField
          label="Не больше дней без выходного"
          size="small"
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))}
          disabled={disabled}
          error={daysError != null}
          helperText={daysError ?? "дней подряд со сменой"}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Button
        variant="contained"
        sx={{ mt: 2 }}
        disabled={!dirty || disabled || hoursError != null || daysError != null}
        onClick={() => void save({ rosterMaxHoursInRow: Number(hours), rosterMaxDaysInRow: Number(days) }, "Пределы графика сохранены")}
      >
        {saving ? "Сохранение…" : "Сохранить"}
      </Button>
    </Box>
  );
};
