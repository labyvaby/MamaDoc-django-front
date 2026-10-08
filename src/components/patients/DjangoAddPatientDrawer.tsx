/**
 * DjangoAddPatientDrawer
 *
 * Django-API version of AddPatientDrawer.
 * Fields: photo, ФИО, phone, birth date, ИНН, blacklist (role-gated).
 * Duplicate warning Collapse in footer.
 */

import React from "react";
import type { InnAbsentReason } from "../../api/patients";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
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
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { motion } from "framer-motion";
import { useNotification } from "@refinedev/core";
import {
  CustomDatePicker,
  FieldLabel,
  FormSectionTitle,
  PhoneNumberField,
  UserAvatar,
  cascadeContainer,
  cascadeItem,
} from "../ui";
import dayjs from "dayjs";
import { formatPatientAge } from "../../utility/age";
import { capitalizeFullName } from "../../utility/name";
import {
  composePhone,
  isPhoneLocalComplete,
  parsePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  type PhoneCountryCode,
} from "../../utility/phone";
import { useCan } from "../../hooks/useCan";
import { useFormValidation } from "../../hooks/useFormValidation";
import {
  createPatient,
  uploadPatientPhoto,
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
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { orgWide } from "../../api/scope";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";

// ── types ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (p: DjangoPatient) => void;
  initialPhone?: string;
  /** Имя из заявки: карту заводят прямо из подтверждения онлайн-записи. */
  initialFullName?: string;
  branchId?: number | null;
  /**
   * Перекрыть z-index дровера. Нужен, когда форма открывается поверх диалога:
   * у MUI `drawer` (1200) ниже `modal` (1300), и без этого форма уезжает под
   * диалог подтверждения.
   */
  zIndex?: number;
};

const MotionStack = motion(Stack);
const MotionBox = motion(Box);

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc) — фото не сохраняем (File не сериализуется, а превью в
// base64 может быть тяжёлым для localStorage).

const DRAFT_STORAGE_KEY = "mamadoc:patients:add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type PatientDraft = {
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

function readPatientDraft(): PatientDraft | null {
  return readFormDraft<PatientDraft>(DRAFT_STORAGE_KEY, DRAFT_TTL_MS);
}

function writePatientDraft(draft: Omit<PatientDraft, "savedAt">): void {
  writeFormDraft(DRAFT_STORAGE_KEY, draft);
}

function clearPatientDraft(): void {
  clearFormDraft(DRAFT_STORAGE_KEY);
}

function isDraftEmpty(d: Omit<PatientDraft, "savedAt">): boolean {
  return (
    !d.fio.trim() &&
    !d.phone &&
    !d.birth &&
    d.gender === "unknown" &&
    !d.address.trim() &&
    !d.inn &&
    !d.family &&
    !d.isBlacklisted &&
    !d.blacklistReason.trim()
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const DjangoAddPatientDrawer: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  initialPhone,
  initialFullName,
  branchId,
  zIndex,
}) => {
  const { t } = useT("patients");
  const { open: notify } = useNotification();
  const orgId = useApiOrgId();
  const canManageBlacklist = useCan("patients.manage");

  // ── fields ─────────────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
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
  const [duplicates, setDuplicates] = React.useState<DjangoPatient[]>([]);
  const [duplicateCheckError, setDuplicateCheckError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  // ── pick photo ─────────────────────────────────────────────────────────────
  const handlePickPhoto = React.useCallback((f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPhotoPreview(null);
    }
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setFio("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setBirth("");
      setGender("unknown");
      setAddress("");
      setInn("");
      setInnAbsentReason("");
      setIsVisitor(false);
      setFamily(null);
      setIsBlacklisted(false);
      setBlacklistReason("");
      setBusy(false);
      setError(null);
      setDuplicates([]);
      setDuplicateCheckError(null);
      setDraftRestored(false);
      return;
    }
    // Предзаполнение из точки входа важнее черновика: заводят карту
    // конкретного человека, а не продолжают прошлую форму.
    if (initialPhone || initialFullName) {
      if (initialPhone) {
        const parsed = parsePhone(initialPhone);
        setPhone(parsed.local);
        setPhoneCountryCode(parsed.countryCode);
      }
      if (initialFullName) setFio(capitalizeFullName(initialFullName));
      return;
    }
    const draft = readPatientDraft();
    if (draft) {
      setFio(draft.fio);
      setPhone(draft.phone);
      setPhoneCountryCode(draft.phoneCountryCode);
      setBirth(draft.birth);
      setGender(draft.gender);
      setAddress(draft.address);
      setInn(draft.inn);
      setFamily(draft.family);
      setIsBlacklisted(draft.isBlacklisted);
      setBlacklistReason(draft.blacklistReason);
      setDraftRestored(true);
    }
  }, [open, initialPhone, initialFullName]);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const draft = {
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
    if (isDraftEmpty(draft)) {
      clearPatientDraft();
    } else {
      writePatientDraft(draft);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, fio, phone, phoneCountryCode, birth, gender, address, inn, family, isBlacklisted, blacklistReason]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    clearPatientDraft();
    setFio("");
    setPhone("");
    setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
    setBirth("");
    setGender("unknown");
    setAddress("");
    setInn("");
    setFamily(null);
    setIsBlacklisted(false);
    setBlacklistReason("");
    setDraftRestored(false);
  };

  // ── duplicate check on phone ───────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    // Ждём полностью набранный номер: по префиксу бэк находит всех, у кого
    // совпало начало, и форма показывала их как дубли, хотя это разные люди.
    if (!isPhoneLocalComplete(phoneCountryCode, phone)) {
      setDuplicates([]);
      setDuplicateCheckError(null);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const { getSimilarPatients } = await import("../../api/patients");
        const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
        const list = await getSimilarPatients(fullPhone, ctrl.signal, orgWide(orgId));
        if (!ctrl.signal.aborted) {
          setDuplicates(list);
          setDuplicateCheckError(null);
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setDuplicates([]);
          setDuplicateCheckError(t("addDrawer.duplicateCheckFailed"));
        }
      }
    }, 500);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [phone, phoneCountryCode, open, orgId, t]);

  const handleUseDuplicate = (patient: DjangoPatient) => {
    clearPatientDraft();
    onCreated?.(patient);
    onClose();
  };

  // ── валидация ─────────────────────────────────────────────────────────────
  const v = useFormValidation({
    fio: fio.trim() ? null : t("form.errors.fullNameRequired"),
    blacklistReason:
      canManageBlacklist && isBlacklisted && !blacklistReason.trim()
        ? t("form.errors.blacklistReasonRequired")
        : null,
  });

  // Каждое открытие дровера — форма снова «не отправлялась».
  React.useEffect(() => {
    if (open) v.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!v.validate()) return;
    // Повторно нормализуем: отправить можно по Enter, не уходя из поля.
    const fioTrim = capitalizeFullName(fio);
    setBusy(true);
    setError(null);
    try {
      const fullPhone = composePhone(phoneCountryCode, phone) ?? "";
      const patient = await createPatient({
        fullName: fioTrim,
        phone: fullPhone,
        birthDate: birth || null,
        gender,
        branchId: branchId ?? null,
        familyId: family?.id ?? null,
        address: address.trim() || undefined,
        inn: inn.trim() || undefined,
        innAbsentReason: inn.trim() ? "" : innAbsentReason,
        isVisitor,
        isBlacklisted: canManageBlacklist ? isBlacklisted : undefined,
        blacklistReason: canManageBlacklist && isBlacklisted ? blacklistReason.trim() : undefined,
      });

      if (photoFile) {
        try {
          await uploadPatientPhoto(patient.id, photoFile);
        } catch {
          notify?.({
            type: "error",
            message: t("addDrawer.createdPhotoFailed"),
          });
        }
      }

      clearPatientDraft();
      notify?.({ type: "success", message: t("addDrawer.created") });
      onCreated?.(patient);
      onClose();
    } catch (err: unknown) {
      const msg = parseBackendError(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const hasDuplicates = duplicates.length > 0;

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
      sx={zIndex != null ? { zIndex } : undefined}
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
          <Typography variant="h6">{t("addDrawer.title")}</Typography>
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
                  inputId="add-patient-photo"
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
                      htmlFor="add-patient-photo"
                      variant="caption"
                      underline="hover"
                      color="text.secondary"
                      sx={{ cursor: busy ? "default" : "pointer", fontWeight: 600 }}
                    >
                      {photoPreview ? t("form.photoChange") : t("form.photoAdd")}
                    </Link>
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
                          // Инпут пикера не наследует minHeight из MuiInputBase и
                          // выходит на 3px ниже — рядом с пилюлями пола это видно.
                          sx: (theme) => ({
                            "& .MuiPickersInputBase-root": {
                              minHeight: theme.appLayout.controls.inputHeight,
                            },
                          }),
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
                  branchId={branchId}
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
                    placeholder={t("addDrawer.blacklistReasonPlaceholder")}
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
          sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}
        >
          {/* duplicate warning */}
          <Collapse in={hasDuplicates}>
            <Box sx={{ px: 2, pt: 1.5 }}>
              <Alert
                severity="warning"
                icon={<WarningAmberOutlined fontSize="small" />}
                sx={{ py: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t("addDrawer.possibleDuplicate")}
                </Typography>
                <Stack spacing={1} sx={{ mt: 0.75 }}>
                  {duplicates.slice(0, 3).map((d) => (
                    <Stack
                      key={d.id}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      gap={1}
                    >
                      <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
                        <UserAvatar src={d.photoUrl} name={d.fullName} size={32} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {d.fullName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {[d.phone, d.birthDate ? dayjs(d.birthDate).format("DD.MM.YYYY") : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </Typography>
                        </Box>
                      </Stack>
                      <Button
                        size="small"
                        onClick={() => handleUseDuplicate(d)}
                        disabled={busy}
                        sx={{ flexShrink: 0 }}
                      >
                        {t("addDrawer.useDuplicate")}
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </Alert>
            </Box>
          </Collapse>

          {duplicateCheckError && (
            <Box sx={{ px: 2, pt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {duplicateCheckError}
              </Typography>
            </Box>
          )}

          <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ p: 2 }}>
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

export default DjangoAddPatientDrawer;
