import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import type { BookingDetail, BookingPatientMatch } from "../../api/bookings";
import { getServices, type Service } from "../../api/catalog";
import { getServiceAssignments } from "../../api/appointments";
import { usePermissions } from "../../hooks/usePermissions";
import { getSimilarPatients, searchPatients, type DjangoPatient } from "../../api/patients";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { formatPatientAge } from "../../utility/age";
import { subtleBg } from "../../theme/uiHelpers";
import DjangoAddPatientDrawer from "../../components/patients/DjangoAddPatientDrawer";
import { bookingTimeRange, hasPrepayment, PrepaymentChip } from "./meta";

/**
 * Подтверждение брони: привязка к карте пациента и набор услуг приёма.
 *
 * Бэк принимает `patientId` и `serviceIds` в `PATCH /api/bookings/<id>/status/`
 * (проверено на живом API 05.08.2026) и сам подсказывает кандидатов по телефону
 * брони в `patientMatches`. Услуги нужны прежде всего для брони, созданной без
 * услуги: витрина резервирует окно, а состав приёма набирает персонал здесь.
 *
 * Диалог показывает саму заявку (кто, когда, к кому), потому что выбор карты —
 * это сверка: один номер телефона даёт и десяток карт семьи, и подтвердить
 * бронь чужой картой нельзя. Без фактов заявки сверять было не с чем.
 */

type PatientOption = {
  id: number;
  fullName: string;
  phone: string;
  birthDate?: string | null;
  /** Карта пришла из подсказок бэка по телефону брони. */
  fromMatch?: boolean;
};

/** Сколько кандидатов показываем карточками; остальные — через поиск. */
const MATCHES_SHOWN = 3;

const matchToOption = (m: BookingPatientMatch): PatientOption => ({
  id: m.id,
  fullName: m.fullName,
  phone: m.phone,
  fromMatch: true,
});

const patientToOption = (p: DjangoPatient): PatientOption => ({
  id: p.id,
  fullName: p.fullName,
  phone: p.phone,
  birthDate: p.birthDate,
});

/** Подпись под ФИО карты: телефон и возраст — по ним и различают тёзок. */
function patientMeta(o: PatientOption): string {
  const parts = [o.phone ? formatPhoneDisplay(o.phone) : "", formatPatientAge(o.birthDate)];
  return parts.filter(Boolean).join(" · ");
}

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
  const { activeBranch, hasPermission, isSuperAdmin } = usePermissions();
  const theme = useTheme();
  // Брейкпоинт `sm` в теме — 360px, телефон в него попадает: разворачиваем
  // диалог на весь экран по `md`.
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  // Заводить карту прямо отсюда может только тот, кому это разрешено вообще:
  // регистратор без patients.create упёрся бы в 403 после заполнения формы.
  const canCreatePatient = isSuperAdmin() || hasPermission("patients.create");

  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [patientInput, setPatientInput] = React.useState("");
  const [found, setFound] = React.useState<PatientOption[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);

  const [services, setServices] = React.useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Service[]>([]);

  const matches = React.useMemo(
    () => (booking.patientMatches ?? []).map(matchToOption),
    [booking.patientMatches],
  );

  /**
   * Дата рождения кандидатов: подсказки брони дают только ФИО и телефон, а
   * различать однофамильцев из одной семьи приходится по возрасту. Один запрос
   * по номеру брони (точные попадания, не подстрока) закрывает весь список.
   */
  const [matchDetails, setMatchDetails] = React.useState<Record<number, string | null>>({});
  React.useEffect(() => {
    if (!open || matches.length === 0 || !booking.patientPhone) {
      setMatchDetails({});
      return;
    }
    const ctrl = new AbortController();
    getSimilarPatients(booking.patientPhone, ctrl.signal, { organizationId: orgId })
      .then((list) => {
        if (ctrl.signal.aborted) return;
        const byId: Record<number, string | null> = {};
        list.forEach((p) => {
          byId[p.id] = p.birthDate;
        });
        setMatchDetails(byId);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, orgId, booking.patientPhone, matches.length]);

  const candidates = React.useMemo(
    () => matches.map((m) => ({ ...m, birthDate: matchDetails[m.id] ?? null })),
    [matches, matchDetails],
  );

  // Единственное совпадение — почти всегда нужный пациент, подставляем сразу.
  // Несколько (одна карта на семью с общим телефоном) — выбор за персоналом.
  React.useEffect(() => {
    if (!open) return;
    setPatient(matches.length === 1 ? matches[0] : null);
    setPatientInput("");
    setFound([]);
  }, [open, matches]);

  // Выбранная карта показывает возраст, как только он доехал.
  const selectedPatient = React.useMemo(() => {
    if (!patient) return null;
    const birthDate = patient.birthDate ?? matchDetails[patient.id] ?? null;
    return { ...patient, birthDate };
  }, [patient, matchDetails]);

  // Услуги из заявки, которые врач в этом филиале не оказывает, — их не
  // предвыбираем (приём с ними не сохранится) и называем под полем.
  const [droppedServices, setDroppedServices] = React.useState<string[]>([]);
  const branchId = booking.branchId ?? activeBranch?.id ?? undefined;

  /**
   * Услуги, которые можно выбрать: активные услуги филиала брони, закреплённые
   * за её врачом. Раньше здесь был весь каталог организации — регистратор мог
   * выбрать услугу, которую врач не ведёт или ведёт только в другом филиале.
   *
   * Связь «услуга ↔ врач» — та же матрица `service-assignments`, что фильтрует
   * форму записи (с `branchId` — пары, пригодные в филиале, как и валидация
   * при сохранении приёма). Врача без маппинга (`doctorId: null`, брони
   * operator.kg) отфильтровать не по чему — показываем услуги филиала.
   * Если матрица не загрузилась, тоже не прячем всё: лучше полный список
   * филиала, чем пустое поле без объяснения.
   */
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setServicesLoading(true);
    Promise.all([
      getServices({ organizationId: orgId, branchId }, undefined, ctrl.signal),
      booking.doctorId != null
        ? getServiceAssignments(branchId, ctrl.signal).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([list, assignments]) => {
        if (ctrl.signal.aborted) return;
        const doctorServiceIds =
          assignments && booking.doctorId != null
            ? new Set(
                assignments.filter((a) => a.employeeId === booking.doctorId).map((a) => a.serviceId),
              )
            : null;
        const available = list.filter(
          (s) => s.isActive && (doctorServiceIds == null || doctorServiceIds.has(s.id)),
        );
        setServices(available);
        const availableIds = new Set(available.map((s) => s.id));
        const fromBooking = (booking.services ?? []).filter((s) => s.id != null);
        setSelected(available.filter((s) => fromBooking.some((b) => b.id === s.id)));
        setDroppedServices(
          fromBooking.filter((b) => !availableIds.has(b.id as number)).map((b) => b.name),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setServicesLoading(false);
      });
    return () => ctrl.abort();
  }, [open, orgId, branchId, booking.doctorId, booking.services]);

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
          setFound(list.map(patientToOption));
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
    const seen = new Set(candidates.map((m) => m.id));
    return [...candidates, ...found.filter((p) => !seen.has(p.id))];
  }, [candidates, found]);

  const servicesTotal = React.useMemo(
    () => selected.reduce((acc, s) => acc + Number(s.basePrice ?? 0), 0),
    [selected],
  );

  const shownCandidates = candidates.slice(0, MATCHES_SHOWN);
  const hiddenCandidates = candidates.length - shownCandidates.length;

  const handleConfirm = () => {
    onConfirm({
      patientId: patient?.id,
      // Пустой набор не отправляем: он не должен стирать услуги брони.
      serviceIds: selected.length > 0 ? selected.map((s) => s.id) : undefined,
    });
  };

  const summaryDate = dayjs(booking.date).locale("ru").format("D MMMM, dd");

  return (
    <>
    {/* ⚠ `maxWidth="sm"` здесь не годится: брейкпоинт `sm` темы — 360px, и
        диалог получался в ширину телефона даже на десктопе (заголовок ломался
        на две строки). Ширину задаём явно. */}
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth={false}
      fullScreen={fullScreen}
      PaperProps={{ sx: fullScreen ? {} : { width: "100%", maxWidth: 560 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>{t("confirm.title")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* ── Что подтверждаем: факты заявки, с которыми сверяют карту ── */}
          <Box
            sx={(th) => ({
              p: 1.5,
              borderRadius: "12px",
              border: 1,
              borderColor: "divider",
              bgcolor: subtleBg(th),
            })}
          >
            <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {booking.patientName || "—"}
                </Typography>
                {booking.patientPhone && (
                  <Typography variant="caption" color="text.secondary">
                    {formatPhoneDisplay(booking.patientPhone)}
                  </Typography>
                )}
              </Box>
              <Chip
                size="small"
                variant="outlined"
                label={t("confirm.summaryCode", { code: booking.confirmationCode })}
                sx={{ flexShrink: 0, height: 24, borderRadius: "7px" }}
              />
            </Stack>
            <Divider sx={{ my: 1.25 }} />
            <Typography variant="body2" fontWeight={600}>
              {summaryDate} · {bookingTimeRange(booking.time, booking.totalDurationMin)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {[booking.doctorName || "—", booking.branchName].filter(Boolean).join(" · ")}
            </Typography>
            {hasPrepayment(booking) && (
              <Box sx={{ mt: 1 }}>
                <PrepaymentChip
                  status={booking.prepaymentStatus as NonNullable<typeof booking.prepaymentStatus>}
                  amount={booking.prepaymentAmount}
                  needsAttention={booking.prepaymentNeedsAttention}
                  expiresAt={booking.prepaymentExpiresAt}
                />
              </Box>
            )}
          </Box>

          <Typography variant="body2" color="text.secondary">
            {t("confirm.subtitle")}
          </Typography>

          {/* ── Карта пациента ── */}
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <PersonSearchOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                  {t("confirm.patientSection")}
                </Typography>
              </Stack>
              {selectedPatient && (
                <Button
                  size="small"
                  onClick={() => setPatient(null)}
                  disabled={busy}
                  sx={{ textTransform: "none" }}
                >
                  {t("confirm.changePatient")}
                </Button>
              )}
            </Stack>

            {selectedPatient ? (
              /* Выбранная карта — единственное, что нужно видеть: сверил и дальше. */
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={(th) => ({
                  p: 1.25,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: "primary.main",
                  bgcolor: subtleBg(th),
                })}
              >
                <CheckCircleOutlined sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {selectedPatient.fullName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {patientMeta(selectedPatient)}
                  </Typography>
                </Box>
                {selectedPatient.fromMatch && (
                  <Chip
                    size="small"
                    label={t("confirm.matchedByPhone")}
                    sx={(th) => ({
                      flexShrink: 0,
                      height: 22,
                      borderRadius: "7px",
                      color: "text.secondary",
                      bgcolor: subtleBg(th, true),
                    })}
                  />
                )}
              </Stack>
            ) : (
              <>
                {shownCandidates.length > 0 && (
                  <Stack spacing={0.75}>
                    {candidates.length > 1 && (
                      <Typography variant="caption" color="text.secondary">
                        {t("confirm.severalMatches", { count: candidates.length })}
                      </Typography>
                    )}
                    {shownCandidates.map((c) => (
                      <Stack
                        key={c.id}
                        component="button"
                        type="button"
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        onClick={() => setPatient(c)}
                        disabled={busy}
                        sx={(th) => ({
                          width: "100%",
                          textAlign: "left",
                          p: 1.25,
                          borderRadius: "10px",
                          border: 1,
                          borderColor: "divider",
                          bgcolor: subtleBg(th),
                          cursor: "pointer",
                          font: "inherit",
                          color: "inherit",
                          "&:hover": { borderColor: "primary.main" },
                        })}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {c.fullName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {patientMeta(c)}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                    {hiddenCandidates > 0 && (
                      <Typography variant="caption" color="text.disabled">
                        {t("confirm.matchMore", { count: hiddenCandidates })}
                      </Typography>
                    )}
                  </Stack>
                )}

                <Autocomplete
                  options={patientOptions}
                  value={null}
                  onChange={(_, v) => setPatient(v)}
                  inputValue={patientInput}
                  onInputChange={(_, v) => setPatientInput(v)}
                  getOptionLabel={(o) => o.fullName}
                  renderOption={(props, o) => (
                    <li {...props} key={o.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {o.fullName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {patientMeta(o)}
                        </Typography>
                      </Box>
                    </li>
                  )}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  loading={searching}
                  disabled={busy}
                  noOptionsText={t("confirm.patientNotFound")}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder={
                        candidates.length > 0
                          ? t("confirm.otherPatientPlaceholder")
                          : t("confirm.patientPlaceholder")
                      }
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

                {candidates.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {t("confirm.noMatches", { phone: formatPhoneDisplay(booking.patientPhone) || "—" })}
                  </Typography>
                )}

                {/* Карту заводим здесь же: раньше подсказка отправляла в раздел
                    «Пациенты», то есть закрыть диалог и собирать бронь заново. */}
                {canCreatePatient && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PersonAddAltOutlined />}
                    onClick={() => setAddPatientOpen(true)}
                    disabled={busy}
                    sx={{ alignSelf: "flex-start", textTransform: "none" }}
                  >
                    {t("confirm.createPatient")}
                  </Button>
                )}

                {/* Подтвердить без карты можно — говорим об этом там, где
                    принимают решение, а не отдельным блоком внизу диалога. */}
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <InfoOutlined sx={{ fontSize: 16, color: "text.disabled", mt: "2px" }} />
                  <Typography variant="caption" color="text.secondary">
                    {t("confirm.withoutPatient")}
                  </Typography>
                </Stack>
              </>
            )}
          </Stack>

          <Divider />

          {/* ── Услуги приёма ── */}
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <MedicalServicesOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {t("confirm.servicesSection")}
              </Typography>
            </Stack>

            {/* Поле только добавляет: выбранное живёт списком ниже, с ценами —
                в чипы внутри поля вторая услуга уже не помещалась. */}
            <Autocomplete
              multiple
              disableCloseOnSelect
              // Крестик «очистить всё» в поле без чипов читается как «очистить
              // поиск» и молча сносил бы весь набор — убрать услугу можно из строки.
              disableClearable
              options={services}
              value={selected}
              onChange={(_, v) => setSelected(v)}
              getOptionLabel={(s) => s.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              loading={servicesLoading}
              disabled={busy}
              renderTags={() => null}
              renderOption={(props, s, { selected: checked }) => (
                <li {...props} key={s.id}>
                  <Checkbox
                    size="small"
                    checked={checked}
                    tabIndex={-1}
                    disableRipple
                    icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                    checkedIcon={<CheckBoxIcon fontSize="small" />}
                    sx={{ mr: 1, ml: -1, py: 0 }}
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="space-between"
                    sx={{ width: "100%", minWidth: 0 }}
                  >
                    <Typography variant="body2" noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {formatKGS(Number(s.basePrice ?? 0))}
                    </Typography>
                  </Stack>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder={t("confirm.servicesAdd")}
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
              <Stack spacing={0.75}>
                {selected.map((s) => (
                  <Stack
                    key={s.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={(th) => ({
                      p: 1.25,
                      borderRadius: "10px",
                      border: 1,
                      borderColor: "divider",
                      bgcolor: subtleBg(th),
                    })}
                  >
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                      {s.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {formatKGS(Number(s.basePrice ?? 0))}
                    </Typography>
                    <Tooltip title={t("confirm.removeService")}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={busy}
                          onClick={() => setSelected(selected.filter((x) => x.id !== s.id))}
                        >
                          <CloseOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
                <Stack direction="row" justifyContent="space-between" sx={{ px: 1.25 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t("confirm.servicesCount", { count: selected.length })}
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {formatKGS(servicesTotal)}
                  </Typography>
                </Stack>
              </Stack>
            )}

            {droppedServices.length > 0 && !servicesLoading && (
              <Typography variant="caption" color="warning.main">
                {t("confirm.servicesNotProvided", {
                  count: droppedServices.length,
                  names: droppedServices.join(", "),
                })}
              </Typography>
            )}
            {/* Без услуг бэк подтверждение отклоняет — говорим до нажатия,
                а не текстом ошибки после. */}
            {selected.length === 0 && !servicesLoading && (
              <Typography variant="caption" color="warning.main">
                {t("confirm.servicesRequired")}
              </Typography>
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("confirm.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={busy || selected.length === 0}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? t("confirm.submitting") : t("confirm.submit")}
        </Button>
      </DialogActions>
    </Dialog>

    {/* Дровер поверх диалога: свой z-index, иначе MUI кладёт его под Dialog. */}
    <DjangoAddPatientDrawer
      open={addPatientOpen && canCreatePatient}
      onClose={() => setAddPatientOpen(false)}
      onCreated={(created) => {
        setPatient(patientToOption(created));
        setAddPatientOpen(false);
      }}
      initialPhone={booking.patientPhone || undefined}
      initialFullName={booking.patientName || undefined}
      branchId={branchId ?? null}
      zIndex={theme.zIndex.modal + 1}
    />
    </>
  );
};

export default ConfirmBookingDialog;
