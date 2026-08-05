import React from "react";
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";

import type { BookingDetail, BookingPatientMatch } from "../../api/bookings";
import { getServices, type Service } from "../../api/catalog";
import { searchPatients } from "../../api/patients";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";

/**
 * Подтверждение брони: привязка к карте пациента и набор услуг приёма.
 *
 * Бэк принимает `patientId` и `serviceIds` в `PATCH /api/bookings/<id>/status/`
 * (проверено на живом API 05.08.2026) и сам подсказывает кандидатов по телефону
 * брони в `patientMatches`. Услуги нужны прежде всего для брони, созданной без
 * услуги: витрина резервирует окно, а состав приёма набирает персонал здесь.
 */

type PatientOption = { id: number; fullName: string; phone: string };

const matchToOption = (m: BookingPatientMatch): PatientOption => ({
  id: m.id,
  fullName: m.fullName,
  phone: m.phone,
});

interface Props {
  booking: BookingDetail;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (extras: { patientId?: number; serviceIds?: number[] }) => void;
}

const ConfirmBookingDialog: React.FC<Props> = ({ booking, open, busy, onClose, onConfirm }) => {
  const { t } = useT("bookings");
  const orgId = useApiOrgId();

  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [patientInput, setPatientInput] = React.useState("");
  const [found, setFound] = React.useState<PatientOption[]>([]);
  const [searching, setSearching] = React.useState(false);

  const [services, setServices] = React.useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Service[]>([]);

  const matches = React.useMemo(
    () => (booking.patientMatches ?? []).map(matchToOption),
    [booking.patientMatches],
  );

  // Единственное совпадение — почти всегда нужный пациент, подставляем сразу.
  // Несколько (одна карта на семью с общим телефоном) — выбор за персоналом.
  React.useEffect(() => {
    if (!open) return;
    setPatient(matches.length === 1 ? matches[0] : null);
    setPatientInput("");
    setFound([]);
  }, [open, matches]);

  // Каталог услуг + предвыбор тех, что уже в брони. У броней operator.kg id
  // услуги может не быть — такие не предвыберутся, персонал укажет вручную.
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setServicesLoading(true);
    getServices({ organizationId: orgId }, undefined, ctrl.signal)
      .then((list) => {
        if (ctrl.signal.aborted) return;
        const active = list.filter((s) => s.isActive);
        setServices(active);
        const bookingIds = (booking.services ?? [])
          .map((s) => s.id)
          .filter((id): id is number => id != null);
        setSelected(active.filter((s) => bookingIds.includes(s.id)));
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setServicesLoading(false);
      });
    return () => ctrl.abort();
  }, [open, orgId, booking.services]);

  // Поиск пациента вручную — когда подсказок нет или нужен не из них.
  React.useEffect(() => {
    const term = patientInput.trim();
    if (!open || term.length < 2) {
      setFound([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setSearching(true);
      searchPatients({ organizationId: orgId }, term, 10, ctrl.signal)
        .then((list) => {
          if (ctrl.signal.aborted) return;
          setFound(list.map((p) => ({ id: p.id, fullName: p.fullName, phone: p.phone })));
        })
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [open, orgId, patientInput]);

  // Подсказки бэка идут первыми, найденные вручную — следом, без дублей.
  const patientOptions = React.useMemo(() => {
    const seen = new Set(matches.map((m) => m.id));
    return [...matches, ...found.filter((p) => !seen.has(p.id))];
  }, [matches, found]);

  const handleConfirm = () => {
    onConfirm({
      patientId: patient?.id,
      // Пустой набор не отправляем: он не должен стирать услуги брони.
      serviceIds: selected.length > 0 ? selected.map((s) => s.id) : undefined,
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("confirm.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t("confirm.subtitle")}
          </Typography>

          <Stack spacing={1}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <PersonSearchOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {t("confirm.patientSection")}
              </Typography>
            </Stack>
            <Autocomplete
              options={patientOptions}
              value={patient}
              onChange={(_, v) => setPatient(v)}
              inputValue={patientInput}
              onInputChange={(_, v) => setPatientInput(v)}
              getOptionLabel={(o) => `${o.fullName}${o.phone ? ` · ${o.phone}` : ""}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              loading={searching}
              disabled={busy}
              noOptionsText={t("confirm.patientNotFound")}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder={t("confirm.patientPlaceholder")}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {searching ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {matches.length > 1 && (
              <Typography variant="caption" color="text.secondary">
                {t("confirm.severalMatches", { count: matches.length })}
              </Typography>
            )}
            {matches.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                {t("confirm.noMatches", { phone: booking.patientPhone || "—" })}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <MedicalServicesOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {t("confirm.servicesSection")}
              </Typography>
            </Stack>
            <Autocomplete
              multiple
              options={services}
              value={selected}
              onChange={(_, v) => setSelected(v)}
              getOptionLabel={(s) => s.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              loading={servicesLoading}
              disabled={busy}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder={t("confirm.servicesPlaceholder")}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {servicesLoading ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {selected.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t("confirm.servicesTotal", {
                  count: selected.length,
                  sum: formatKGS(selected.reduce((acc, s) => acc + Number(s.basePrice ?? 0), 0)),
                })}
              </Typography>
            )}
          </Stack>

          {!patient && (
            <Alert severity="info" variant="outlined">
              {t("confirm.withoutPatient")}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("confirm.cancel")}
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleConfirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : undefined}
        >
          {t("confirm.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmBookingDialog;
