/**
 * «Настройки» → «Отель» — параметры объекта размещения Viva (заезд/выезд,
 * правила проживания, выезд с задолженностью). Вкладка рельса
 * SettingsLayout.tsx, видна только vertical==="hotel" (TAB_DEFS в
 * SettingsLayout.tsx), маршрут /settings/hotel-property гейтит hotel.manage.
 *
 * До этой страницы поля HotelProperty.checkInTime/checkOutTime/houseRules/
 * allowCheckoutWithDebt (api/hotel.ts) читались (RoomBookingGrid.tsx —
 * подсказка в подвале шахматки), но нигде не редактировались — раздел
 * «Настройки» отеля состоял только из «Организация» и «Филиалы»
 * (см. живой QA-отчёт Viva-босса, 29.09.2026: «отельный раздел содержит
 * только Организация и Филиалы — не хватает заезда/выезда, правил отмены»).
 * Налоги и реквизиты для счетов, которые босс тоже просил, на бэке пока не
 * заведены (нет полей в HotelProperty) — здесь их нет; это отдельный запрос
 * бек-разработчику, не эта страница.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import { useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { usePermissions } from "../hooks/usePermissions";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { useHotelProperty } from "./useHotelProperty";
import { updateHotelProperty, type HotelPropertyUpdateData } from "../api/hotel";
import { getErrorMessage } from "../api/client";

export const HotelPropertySettingsPage: React.FC = () => {
  usePageTitle("Отель");
  const { activeOrganization } = usePermissions();
  const queryClient = useQueryClient();
  const { property, isLoading, isError } = useHotelProperty();

  const [checkInTime, setCheckInTime] = React.useState("");
  const [checkOutTime, setCheckOutTime] = React.useState("");
  const [houseRules, setHouseRules] = React.useState("");
  const [allowCheckoutWithDebt, setAllowCheckoutWithDebt] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  // «14:00:00» с бэка → «14:00» для <input type="time">.
  const toTimeInput = (raw: string) => raw.slice(0, 5);

  React.useEffect(() => {
    if (!property) return;
    setCheckInTime(toTimeInput(property.checkInTime));
    setCheckOutTime(toTimeInput(property.checkOutTime));
    setHouseRules(property.houseRules);
    setAllowCheckoutWithDebt(property.allowCheckoutWithDebt);
  }, [property]);

  const dirty =
    !!property &&
    (toTimeInput(property.checkInTime) !== checkInTime ||
      toTimeInput(property.checkOutTime) !== checkOutTime ||
      property.houseRules !== houseRules ||
      property.allowCheckoutWithDebt !== allowCheckoutWithDebt);

  const handleSave = async () => {
    if (!property || !dirty) return;
    setBusy(true);
    setSaveError(null);
    try {
      const patch: HotelPropertyUpdateData = {
        checkInTime,
        checkOutTime,
        houseRules,
        allowCheckoutWithDebt,
      };
      await updateHotelProperty(property.id, patch);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "properties", activeOrganization?.id] });
      setToast("Настройки отеля сохранены");
    } catch (err) {
      setSaveError(getErrorMessage(err, "Не удалось сохранить настройки отеля"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2.5 }}>
        <HotelOutlined color="action" />
        <Typography variant="h6" fontWeight={600}>
          Отель
        </Typography>
      </Stack>

      {isLoading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {!isLoading && (isError || !property) && (
        <Alert severity="error" variant="outlined" sx={{ maxWidth: 640 }}>
          Не удалось загрузить объект размещения.
        </Alert>
      )}

      {!isLoading && property && (
        <Stack gap={3} sx={{ maxWidth: 640 }}>
          {saveError && (
            <Alert severity="error" variant="outlined" onClose={() => setSaveError(null)} sx={{ fontSize: "0.8rem" }}>
              {saveError}
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              Заезд и выезд
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Время подставляется гостю при бронировании и показывается администратору в шахматке.
            </Typography>
            <Stack direction="row" gap={2}>
              <TextField
                label="Заезд с"
                type="time"
                size="small"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 160 }}
              />
              <TextField
                label="Выезд до"
                type="time"
                size="small"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 160 }}
              />
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              Правила проживания
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Условия отмены, депозит, домашние животные и другие правила — свободный текст для гостя.
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={4}
              placeholder="Например: бесплатная отмена за 24 часа до заезда, депозит 2000 сом наличными…"
              value={houseRules}
              onChange={(e) => setHouseRules(e.target.value)}
            />
          </Box>

          <Divider />

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={allowCheckoutWithDebt}
                  onChange={(e) => setAllowCheckoutWithDebt(e.target.checked)}
                />
              }
              label="Разрешать выезд с задолженностью"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: "42px", mt: -0.5 }}>
              Выключено — админ не сможет закрыть бронь на выезд, пока гость не оплатит счёт полностью.
            </Typography>
          </Box>

          <Box>
            <Button variant="contained" disabled={!dirty || busy} onClick={() => void handleSave()}>
              {busy ? "Сохранение…" : "Сохранить"}
            </Button>
          </Box>
        </Stack>
      )}

      <Snackbar
        open={toast != null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: "100%" }}>
          {toast}
        </Alert>
      </Snackbar>
    </SettingsLayout>
  );
};

export default HotelPropertySettingsPage;
