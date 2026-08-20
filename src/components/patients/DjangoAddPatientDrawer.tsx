/**
 * DjangoAddPatientDrawer
 *
 * Django-API version of AddPatientDrawer.
 * Fields: photo, ФИО, phone, birth date, ИНН, blacklist (role-gated).
 * Duplicate warning Collapse in footer.
 */

import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import NumbersOutlined from "@mui/icons-material/NumbersOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import BoyOutlined from "@mui/icons-material/BoyOutlined";
import GirlOutlined from "@mui/icons-material/GirlOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { motion } from "framer-motion";
import { useNotification } from "@refinedev/core";
import { CustomDatePicker, PhoneCountryCodeSelect, UserAvatar, cascadeContainer, cascadeItem } from "../ui";
import dayjs from "dayjs";
import { formatPatientAge } from "../../utility/age";
import { capitalizeFullName } from "../../utility/name";
import {
  composePhone,
  isPhoneLocalComplete,
  parsePhone,
  formatPhoneLocalDisplay,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  handlePhonePaste,
  type PhoneCountryCode,
} from "../../utility/phone";
import { usePhoneLocalInput } from "../../hooks/usePhoneLocalInput";
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
  branchId?: number | null;
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
  branchId,
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
  // Правка в середине номера не должна выбрасывать курсор в конец.
  const phoneInput = usePhoneLocalInput(
    phoneCountryCode,
    phone,
    setPhone,
    setPhoneCountryCode,
  );
  const [birth, setBirth] = React.useState("");
  const [gender, setGender] = React.useState<PatientGender>("unknown");
  const [address, setAddress] = React.useState("");
  const [inn, setInn] = React.useState("");
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
    if (initialPhone) {
      const parsed = parsePhone(initialPhone);
      setPhone(parsed.local);
      setPhoneCountryCode(parsed.countryCode);
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
  }, [open, initialPhone]);

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
          <MotionStack spacing={3} variants={cascadeContainer} initial="hidden" animate="show">
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* ── Фото ── */}
            <MotionBox variants={cascadeItem}>
              <PatientPhotoUploader
                photoFile={photoFile}
                photoPreview={photoPreview}
                onPickPhoto={handlePickPhoto}
                inputId="add-patient-photo"
                disabled={busy}
              />
            </MotionBox>

            {/* ── ФИО ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {t("form.fullName")}
                </Typography>
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
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineOutlined fontSize="small" color="disabled" />
                      </InputAdornment>
                    ),
                    endAdornment: fio.trim() ? (
                      <InputAdornment position="end">
                        <CheckCircleOutlined fontSize="small" color="success" />
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
              </Stack>
            </MotionBox>

            {/* ── Телефон ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {t("form.phone")}
                </Typography>
                <TextField
                  value={formatPhoneLocalDisplay(phoneCountryCode, phone)}
                  inputRef={phoneInput.inputRef}
                  onChange={phoneInput.onChange}
                  onPaste={(e) =>
                    handlePhonePaste(e, phoneCountryCode, (code, local) => {
                      setPhoneCountryCode(code);
                      setPhone(local);
                    })
                  }
                  onKeyDown={(e) => {
                    phoneInput.onKeyDown(e);
                    submitOnEnter(e);
                  }}
                  fullWidth
                  size="small"
                  disabled={busy}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ mr: 1, ml: "-14px" }}>
                        <PhoneCountryCodeSelect
                          value={phoneCountryCode}
                          onChange={(code) => setPhoneCountryCode(code)}
                        />
                      </InputAdornment>
                    ),
                    endAdornment:
                      phone.length === getPhoneLocalMaxLength(phoneCountryCode) ? (
                        <InputAdornment position="end">
                          <CheckCircleOutlined fontSize="small" color="success" />
                        </InputAdornment>
                      ) : undefined,
                  }}
                  inputProps={{
                    inputMode: "tel",
                    pattern: "[0-9]*",
                  }}
                  placeholder={
                    getPhoneLocalMaxLength(phoneCountryCode) === 10
                      ? "XXX XXX XXXX"
                      : "XXX XXX XXX"
                  }
                />
              </Stack>
            </MotionBox>

            {/* ── О пациенте ── */}
            <MotionBox variants={cascadeItem}>
              <Stack spacing={1.5}>
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                  {t("form.sectionAbout")}
                </Typography>

                <Stack spacing={0.5}>
                  <Stack direction="row" alignItems="baseline" flexWrap="wrap" justifyContent="space-between" gap={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {t("form.birthDate")}
                    </Typography>
                    {formatPatientAge(birth) && (
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                        {formatPatientAge(birth)}
                      </Typography>
                    )}
                  </Stack>
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
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {t("form.gender")}
                  </Typography>
                  <ToggleButtonGroup
                    value={gender === "unknown" ? null : gender}
                    exclusive
                    onChange={(_, val) => setGender((val as PatientGender) ?? "unknown")}
                    disabled={busy}
                    fullWidth
                    size="small"
                  >
                    <ToggleButton value="male" sx={{ gap: 0.5 }}>
                      <BoyOutlined fontSize="small" />
                      {t("form.genderMale")}
                    </ToggleButton>
                    <ToggleButton value="female" sx={{ gap: 0.5 }}>
                      <GirlOutlined fontSize="small" />
                      {t("form.genderFemale")}
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>

                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {t("form.address")}
                  </Typography>
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
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                  {t("form.sectionExtra")}
                </Typography>

                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {t("form.inn")}
                  </Typography>
                  <TextField
                    value={inn}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 14);
                      setInn(v);
                    }}
                    onKeyDown={submitOnEnter}
                    fullWidth
                    size="small"
                    placeholder="000000000000"
                    disabled={busy}
                    inputProps={{ inputMode: "numeric" }}
                    helperText={`${inn.length}/14`}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <NumbersOutlined fontSize="small" color="disabled" />
                        </InputAdornment>
                      ),
                      endAdornment: inn.length === 14 ? (
                        <InputAdornment position="end">
                          <CheckCircleOutlined fontSize="small" color="success" />
                        </InputAdornment>
                      ) : undefined,
                    }}
                  />
                </Stack>

                <PatientFamilyField
                  value={family}
                  onChange={setFamily}
                  branchId={branchId}
                  disabled={busy}
                />
              </Stack>
            </MotionBox>

            {/* ── Чёрный список (role-gated) ── */}
            {canManageBlacklist && (
              <MotionBox variants={cascadeItem}>
              <Stack spacing={1}>
                <Divider />
                <FormControlLabel
                  control={
                    <Switch
                      checked={isBlacklisted}
                      onChange={(e) => {
                        setIsBlacklisted(e.target.checked);
                        if (!e.target.checked) setBlacklistReason("");
                      }}
                      disabled={busy}
                      color="error"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t("form.blacklisted")}
                    </Typography>
                  }
                />
                <Collapse in={isBlacklisted}>
                  <TextField
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    placeholder={t("addDrawer.blacklistReasonPlaceholder")}
                    disabled={busy}
                    required={isBlacklisted}
                    {...v.field("blacklistReason")}
                  />
                </Collapse>
              </Stack>
              </MotionBox>
            )}
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
