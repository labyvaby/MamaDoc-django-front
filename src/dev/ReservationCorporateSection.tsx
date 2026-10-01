/**
 * «Юрлицо» в карточке брони: привязка к компании из справочника. Скидка
 * юрлица действует на проживание (не на допуслуги); название и процент
 * фиксируются в брони, поздняя правка справочника старую бронь не
 * переоценивает. Привязка, смена и отвязка пересчитывают сумму брони и
 * пишутся в историю. Бэк: corporateAccountId / clearCorporateAccount в PATCH
 * брони с version (право hotel.reservations.manage).
 */
import React from "react";
import { Alert, Box, Button, Collapse, MenuItem, Stack, TextField, Typography } from "@mui/material";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { useCan } from "../hooks/useCan";
import { listCorporateAccounts, updateReservation, type HotelReservation } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
import { FieldIcon } from "./FieldIcon";

export const ReservationCorporateSection: React.FC<{ reservation: HotelReservation; live: boolean; onChanged: () => void }> = ({
  reservation,
  live,
  onChanged,
}) => {
  const canManage = useCan("hotel.reservations.manage");
  const { enqueueSnackbar } = useSnackbar();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<number | "">("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["hotel", "corporateAccounts", reservation.propertyId, "active"],
    queryFn: ({ signal }) => listCorporateAccounts(reservation.propertyId, { limit: 200 }, signal),
    enabled: canManage && live,
    staleTime: 5 * 60_000,
  });
  const accounts = accountsQuery.data?.results ?? [];
  const attached = reservation.corporateAccountId != null;
  const discount = Number(reservation.corporateDiscountPercent ?? 0);

  React.useEffect(() => {
    setOpen(false);
    setError(null);
  }, [reservation.id]);

  if (!attached && (!canManage || !live || accounts.length === 0)) return null;

  const apply = async (body: { corporateAccountId?: number; clearCorporateAccount?: boolean }, done: string) => {
    setSaving(true);
    setError(null);
    try {
      await updateReservation(reservation.id, { version: reservation.version, ...body });
      setOpen(false);
      onChanged();
      enqueueSnackbar(done, { variant: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        onChanged();
        setError("Бронь только что изменили. Данные обновлены — повторите.");
      } else {
        setError(getErrorMessage(err, "Не удалось изменить юрлицо"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 3.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }} gap={1}>
        <Typography
          component="div"
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
        >
          Юрлицо
        </Typography>
        {canManage && live && !open && (
          <Button
            size="small"
            startIcon={<BusinessOutlined fontSize="small" />}
            onClick={() => {
              setChoice(reservation.corporateAccountId ?? "");
              setError(null);
              setOpen(true);
            }}
          >
            {attached ? "Изменить" : "Привязать"}
          </Button>
        )}
      </Stack>
      {attached ? (
        <Typography variant="body2">
          <b>{reservation.corporateName || `Юрлицо №${reservation.corporateAccountId}`}</b>
          <Typography component="span" variant="body2" color="text.secondary">
            {discount > 0 ? ` · скидка ${discount.toLocaleString("ru-RU")}% на проживание` : " · без скидки"}
          </Typography>
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Бронь не привязана к юрлицу.
        </Typography>
      )}
      {reservation.companyInfo && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
          {reservation.companyInfo}
        </Typography>
      )}
      <Collapse in={open} unmountOnExit>
        <Stack gap={1.5} sx={{ mt: 1.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            size="small"
            label="Юрлицо"
            value={choice}
            onChange={(e) => setChoice(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={saving}
            slotProps={{ input: { startAdornment: <FieldIcon icon={<BusinessOutlined />} /> } }}
            helperText="Сумма брони пересчитается: скидка — только на проживание"
            fullWidth
          >
            {accounts.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.name}
                {Number(a.discountPercent) > 0 ? ` · −${Number(a.discountPercent)}%` : ""}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" gap={1} justifyContent="space-between">
            {attached ? (
              <Button size="small" color="error" disabled={saving} onClick={() => void apply({ clearCorporateAccount: true }, "Юрлицо отвязано, сумма пересчитана")}>
                Отвязать
              </Button>
            ) : (
              <span />
            )}
            <Stack direction="row" gap={1}>
              <Button size="small" onClick={() => setOpen(false)} disabled={saving}>
                Отмена
              </Button>
              <Button
                size="small"
                variant="contained"
                disableElevation
                disabled={saving || choice === "" || choice === reservation.corporateAccountId}
                onClick={() => choice !== "" && void apply({ corporateAccountId: choice }, "Юрлицо привязано, сумма пересчитана")}
              >
                {saving ? "Сохраняем…" : "Применить"}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Collapse>
    </Box>
  );
};

export default ReservationCorporateSection;
