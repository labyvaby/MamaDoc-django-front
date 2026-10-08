import React from "react";
import type { InnAbsentReason } from "../../api/patients";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { motion } from "framer-motion";
import { useNotification } from "@refinedev/core";
import {
  CustomDatePicker,
  FieldLabel,
  FormSectionTitle,
  PhoneNumberField,
  cascadeContainer,
  cascadeItem,
} from "../ui";
import dayjs from "dayjs";
import { formatPatientAge } from "../../utility/age";
import { capitalizeFullName } from "../../utility/name";
import {
  composePhone,
  parsePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../utility/phone";
import { useCan } from "../../hooks/useCan";
import { useFormValidation } from "../../hooks/useFormValidation";
import {
  updatePatient,
  uploadPatientPhoto,
  deletePatientPhoto,
  getPatient,
  type DjangoPatient,
  type PatientGender,
} from "../../api/patients";
import PatientFamilyField from "./PatientFamilyField";
import type { DjangoFamily } from "../../api/patients";
import { parseBackendError } from "../../api/appointments";
import PatientPhotoUploader from "./PatientPhotoUploader";
import PatientGenderPills from "./PatientGenderPills";
import PatientInnField from "./PatientInnField";
import PatientBlacklistField from "./PatientBlacklistField";
import AddressAutocomplete from "./AddressAutocomplete";
import { useT } from "../../i18n/VerticalProvider";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";

type Props = {
  open: boolean;
  patient: DjangoPatient | null;
  onClose: () => void;
  onUpdated: (p: DjangoPatient) => void;
};

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых правок при закрытии дровера. В отличие
// от формы создания, здесь поля стартуют не пустыми, а из данных пациента —
// поэтому черновик пишется, только если текущие значения отличаются от
// исходных (иначе «черновиком» считалась бы вообще любая открытая карточка),
// а «Очистить» откатывает к исходным данным пациента, а не к пустой форме.
// Ключ включает id пациента — черновик одного пациента не должен всплывать
// в форме другого. Фото не сохраняем (File не сериализуется).

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type PatientEditDraft = {
  savedAt: number;
  fio: string;
  phone: string;
  phoneCountryCode: PhoneCountryCode;
  birth: string;
  gender: PatientGender;
  address: string;
  inn: string;
  family: DjangoFamily | null;
  isBlacklisted: boolean;
  blacklistReason: string;
};

function draftKeyFor(patientId: number): string {
  return `mamadoc:patients:edit-draft:${patientId}`;
}

function sameAsBaseline(
  a: Omit<PatientEditDraft, "savedAt">,
  b: Omit<PatientEditDraft, "savedAt">,
): boolean {
  return (
    a.fio === b.fio &&
    a.phone === b.phone &&
    a.phoneCountryCode === b.phoneCountryCode &&
    a.birth === b.birth &&
    a.gender === b.gender &&
    a.address === b.address &&
    a.inn === b.inn &&
    (a.family?.id ?? null) === (b.family?.id ?? null) &&
    a.isBlacklisted === b.isBlacklisted &&
    a.blacklistReason === b.blacklistReason
  );
}

const DjangoEditPatientDrawer: React.FC<Props> = ({
  open,
  patient,
  onClose,
  onUpdated,
}) => {
  const { t } = useT("patients");
  const { open: notify } = useNotification();
  const canManageBlacklist = useCan("patients.manage");

  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [fio, setFio] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneCountryCode, setPhoneCountryCode] =
    React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [birth, setBirth] = React.useState("");
  const [gender, setGender] = React.useState<PatientGender>("unknown");
  const [address, setAddress] = React.useState("");
  const [inn, setInn] = React.useState("");
  /** Почему нет ИНН — нужно для оформления прививки. */
  const [innAbsentReason, setInnAbsentReason] = React.useState<InnAbsentReason | "">("");
  /** «Приезжий» — графа формы 5. */
  const [isVisitor, setIsVisitor] = React.useState(false);
  const [family, setFamily] = React.useState<DjangoFamily | null>(null);
  const [isBlacklisted, setIsBlacklisted] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  const baselineRef = React.useRef<Omit<PatientEditDraft, "savedAt"> | null>(null);

  const v = useFormValidation({
    fio: fio.trim() ? null : t("form.errors.fullNameRequired"),
    blacklistReason:
      canManageBlacklist && isBlacklisted && !blacklistReason.trim()
        ? t("form.errors.blacklistReasonRequired")
        : null,
  });

  // ── загрузка данных пациента + восстановление черновика ─────────────────────
  React.useEffect(() => {
    if (!open || !patient) return;
    setPhotoFile(null);
    setPhotoPreview(patient.photoUrl || null);
    setRemovePhoto(false);

    const parsed = parsePhone(patient.phone || "");
    const maxLen = getPhoneLocalMaxLength(parsed.countryCode);
    const baseline: Omit<PatientEditDraft, "savedAt"> = {
      fio: patient.fullName || "",
      phone: parsed.local.replace(/[^\d]/g, "").slice(0, maxLen),
      phoneCountryCode: parsed.countryCode,
      birth: patient.birthDate || "",
      gender: patient.gender || "unknown",
      address: patient.address || "",
      inn: patient.inn || "",
      family: patient.family || null,
      isBlacklisted: patient.isBlacklisted || false,
      blacklistReason: patient.blacklistReason || "",
    };
    baselineRef.current = baseline;

    const draft = readFormDraft<PatientEditDraft>(draftKeyFor(patient.id), DRAFT_TTL_MS);
    const next = draft ?? baseline;

    setFio(next.fio);
    setPhone(next.phone);
    setPhoneCountryCode(next.phoneCountryCode);
    setBirth(next.birth);
    setGender(next.gender);
    setAddress(next.address);
    setInn(next.inn);
    setInnAbsentReason(patient.innAbsentReason ?? "");
    setIsVisitor(patient.isVisitor ?? false);
    setFamily(next.family);
    setIsBlacklisted(next.isBlacklisted);
    setBlacklistReason(next.blacklistReason);
    setDraftRestored(Boolean(draft));

    v.reset();
    setError(null);
    // v.reset стабилен — в зависимостях только открытие/смена пациента.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    if (!patient) return;
    const current: Omit<PatientEditDraft, "savedAt"> = {
      fio,
      phone,
      phoneCountryCode,
      birth,
      gender,
      address,
      inn,
      family,
      isBlacklisted,
      blacklistReason,
    };
    const key = draftKeyFor(patient.id);
    if (baselineRef.current && sameAsBaseline(current, baselineRef.current)) {
      clearFormDraft(key);
    } else {
      writeFormDraft(key, current);
    }
  };

  React.useEffect(() => {
    if (!open || !patient) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, patient, fio, phone, phoneCountryCode, birth, gender, address, inn, family, isBlacklisted, blacklistReason]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    if (!patient) return;
    clearFormDraft(draftKeyFor(patient.id));
    const b = baselineRef.current;
    if (b) {
      setFio(b.fio);
      setPhone(b.phone);
      setPhoneCountryCode(b.phoneCountryCode);
      setBirth(b.birth);
      setGender(b.gender);
      setAddress(b.address);
      setInn(b.inn);
      setFamily(b.family);
      setIsBlacklisted(b.isBlacklisted);
      setBlacklistReason(b.blacklistReason);
    }
    setDraftRestored(false);
  };

  const handlePickPhoto = React.useCallback((f: File | null) => {
    setRemovePhoto(false);
    setPhotoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPhotoPreview(patient?.photoUrl || null);
    }
  }, [patient?.photoUrl]);

  const handleRemovePhoto = () => {
    setRemovePhoto(true);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!v.validate()) return;
    // Повторно нормализуем: отправить можно по Enter, не уходя из поля.
    const fioTrim = capitalizeFullName(fio);
    if (!patient) return;

    setBusy(true);
    setError(null);
    try {
      const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
      await updatePatient(patient.id, {
        fullName: fioTrim,
        phone: fullPhone || undefined,
        birthDate: birth || null,
        gender,
        address: address.trim() || null,
        inn: inn.trim() || undefined,
        innAbsentReason: inn.trim() ? "" : innAbsentReason,
        isVisitor,
        familyId: family?.id ?? null,
        isBlacklisted: canManageBlacklist ? isBlacklisted : undefined,
        blacklistReason:
          canManageBlacklist && isBlacklisted ? blacklistReason.trim() : undefined,
      });

      // photo operations
      if (removePhoto && !photoFile) {
        try {
          await deletePatientPhoto(patient.id);
        } catch {
          // non-fatal
        }
      } else if (photoFile) {
        try {
          await uploadPatientPhoto(patient.id, photoFile);
        } catch {
          notify?.({ type: "error", message: t("editDrawer.savedPhotoFailed") });
        }
      }

      // fetch fresh to get updated photoUrl
      const fresh = await getPatient(patient.id);
      clearFormDraft(draftKeyFor(patient.id));
      notify?.({ type: "success", message: t("editDrawer.saved") });
      onUpdated(fresh);
      onClose();
    } catch (err: unknown) {
      const msg = parseBackendError(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const existingPhoto = patient?.photoUrl || null;
  const showDeletePhotoBtn =
    (existingPhoto || photoPreview) && !photoFile && !removePhoto;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 520 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box
        sx={{
          width: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="h6">{t("editDrawer.title")}</Typography>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {draftRestored && (
              <Tooltip title={`${t("addDrawer.draftRestored")} — ${t("addDrawer.draftDiscard").toLowerCase()}?`}>
                <IconButton onClick={handleDiscardDraft} aria-label={t("addDrawer.draftDiscard")}>
                  <RestoreOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={busy ? undefined : handleClose} aria-label={t("form.close")}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </Box>
        <Divider />

        {/* body */}
        <Box
          sx={{
            p: 2,
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <MotionStack spacing={2} variants={cascadeContainer} initial="hidden" animate="show">
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* ── Фото + ФИО ── */}
            <MotionBox variants={cascadeItem}>
              <Stack direction="row" gap={2} alignItems="flex-start">
                <PatientPhotoUploader
                  photoFile={photoFile}
                  photoPreview={photoPreview}
                  onPickPhoto={handlePickPhoto}
                  inputId="edit-patient-photo"
                  disabled={busy}
                  size={56}
                  showCaption={false}
                />
                <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                  <FieldLabel>{t("form.fullName")}</FieldLabel>
                  <TextField
                    value={fio}
                    onChange={(e) => setFio(e.target.value)}
                    onBlur={() => setFio(capitalizeFullName(fio))}
                    onKeyDown={submitOnEnter}
                    fullWidth
                    size="small"
                    autoFocus
                    placeholder={t("form.errors.fullNameRequired")}
                    disabled={busy}
                    {...v.field("fio")}
                    InputProps={{
                      endAdornment: fio.trim() ? (
                        <InputAdornment position="end">
                          <CheckCircleOutlined fontSize="small" color="success" />
                        </InputAdornment>
                      ) : undefined,
                    }}
                  />
                  <Stack direction="row" gap={1.5}>
                    <Link
                      component="label"
                      htmlFor="edit-patient-photo"
                      variant="caption"
                      underline="hover"
                      color="text.secondary"
                      sx={{ cursor: busy ? "default" : "pointer", fontWeight: 600 }}
                    >
                      {photoPreview ? t("form.photoChange") : t("form.photoAdd")}
                    </Link>
                    {showDeletePhotoBtn && (
                      <Link
                        component="button"
                        type="button"
                        variant="caption"
                        underline="hover"
                        color="error"
                        onClick={handleRemovePhoto}
                        disabled={busy}
                        sx={{ fontWeight: 600 }}
                      >
                        {t("editDrawer.photoDelete")}
                      </Link>
                    )}
                  </Stack>
                </Stack>
              </Stack>
            </MotionBox>

            {/* ── Телефон ── */}
            <MotionBox variants={cascadeItem}>
              <PhoneNumberField
                dense
                label={t("form.phone")}
                countryCode={phoneCountryCode}
                phone={phone}
                onCountryCodeChange={setPhoneCountryCode}
                onPhoneChange={setPhone}
                disabled={busy}
                onEnter={submitOnEnter}
              />
            </MotionBox>

            {/* ── О пациенте ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1.5}>
                <FormSectionTitle>{t("form.sectionAbout")}</FormSectionTitle>

                {/* ИНН выше пола и даты рождения: он сам их заполняет. */}
                <PatientInnField
                  inn={inn}
                  onInnChange={setInn}
                  innAbsentReason={innAbsentReason}
                  onInnAbsentReasonChange={setInnAbsentReason}
                  isVisitor={isVisitor}
                  onVisitorChange={setIsVisitor}
                  gender={gender}
                  onGenderChange={setGender}
                  birth={birth}
                  onBirthChange={setBirth}
                  disabled={busy}
                  onEnter={submitOnEnter}
                />

                <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="flex-end">
                  <Stack spacing={0.5} sx={{ flex: "1 1 170px", minWidth: 0 }}>
                    <FieldLabel
                      end={
                        formatPatientAge(birth) ? (
                          <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                            {formatPatientAge(birth)}
                          </Typography>
                        ) : undefined
                      }
                    >
                      {t("form.birthDate")}
                    </FieldLabel>
                    <CustomDatePicker
                      value={birth ? dayjs(birth) : null}
                      onChange={(val) => setBirth(val ? val.format("YYYY-MM-DD") : "")}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          size: "small",
                          InputLabelProps: { shrink: true },
                          placeholder: t("form.birthDatePlaceholder"),
                          disabled: busy,
                          // Enter сохраняет, как в остальных полях. Если год введен коротко,
                          // первое нажатие уйдет на дописывание века (см. CustomDatePicker).
                          onKeyDown: submitOnEnter,
                        },
                      }}
                    />
                  </Stack>
                  <Stack spacing={0.5}>
                    <FieldLabel>{t("form.gender")}</FieldLabel>
                    <PatientGenderPills value={gender} onChange={setGender} disabled={busy} />
                  </Stack>
                </Stack>

                <Stack spacing={0.5}>
                  <FieldLabel>{t("form.address")}</FieldLabel>
                  <AddressAutocomplete
                    value={address}
                    onChange={setAddress}
                    disabled={busy}
                  />
                </Stack>
              </Stack>
            </MotionBox>

            {/* ── Дополнительно ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1.5}>
                <FormSectionTitle>{t("form.sectionExtra")}</FormSectionTitle>

                <PatientFamilyField
                  value={family}
                  onChange={setFamily}
                  branchId={patient?.branch?.id}
                  disabled={busy}
                />

                {/* ── Чёрный список (role-gated) ── */}
                {canManageBlacklist && (
                  <PatientBlacklistField
                    checked={isBlacklisted}
                    onCheckedChange={(next) => {
                      setIsBlacklisted(next);
                      if (!next) setBlacklistReason("");
                    }}
                    reason={blacklistReason}
                    onReasonChange={setBlacklistReason}
                    placeholder={t("editDrawer.blacklistReasonPlaceholder")}
                    disabled={busy}
                    reasonFieldProps={v.field("blacklistReason")}
                  />
                )}
              </Stack>
            </MotionBox>
          </MotionStack>
        </Box>

        {/* footer */}
        <Box
          sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper", p: 2 }}
        >
          <Stack direction="row" gap={1} justifyContent="flex-end">
            <Button onClick={handleClose} disabled={busy}>
              {t("form.cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={busy}
            >
              {busy ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={18} />
                  <span>{t("form.saving")}</span>
                </Stack>
              ) : (
                t("form.save")
              )}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
};

export default DjangoEditPatientDrawer;
