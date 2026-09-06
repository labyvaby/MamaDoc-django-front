import React from "react";
import { Box, Button, Dialog, IconButton, Menu, MenuItem, Stack, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import ShareOutlined from "@mui/icons-material/ShareOutlined";
import QRCode from "react-qr-code";

import {
  getBookingByCode,
  type GuestBookingResult,
  type ProfessionalDetail,
  type PublicBookingDetail,
} from "../../../api/publicBooking";
import { useT } from "../../../i18n/VerticalProvider";
import { capitalizeFullName } from "../../../utility/name";
import {
  BOOKING_PRIMARY,
  BOOKING_PRIMARY_HOVER,
  BOOKING_RADIUS,
  BORDER,
  MUTED,
  PILL_RADIUS,
  TILE_RADIUS,
} from "../theme";
import { CountryFlag } from "../../../components/ui/CountryFlag";
import {
  PHONE_COUNTRIES,
  PRIMARY_PHONE_COUNTRY_COUNT,
  getPhoneExactLength,
  isPhoneLocalComplete,
  normalizePhoneLocal,
  parsePhoneInput,
  parsePastedPhone,
  phonePlaceholder,
  type PhoneCountryInfo,
} from "../../../utility/phone";
import { bookingCodeUrl, formatPrice } from "../format";
import { useBookingOrgSlug } from "../orgSlug";
import type { PickableService } from "./ServicesCard";
import type { BookingChoice } from "./choice";

/** Где помним контакты гостя между записями — как в эталоне. */
const SAVED_NAME_KEY = "mamadoc:booking:name";
const SAVED_PHONE_KEY = "mamadoc:booking:phone";

/** Общая обёртка модалок витрины: затемнение и белая карточка. */
const ModalPaper: React.FC<
  React.PropsWithChildren<{ open: boolean; onClose: () => void; maxWidth: number }>
> = ({ open, onClose, maxWidth, children }) => (
  <Dialog
    open={open}
    onClose={onClose}
    fullWidth
    PaperProps={{
      sx: {
        maxWidth,
        width: "100%",
        m: 2,
        borderRadius: BOOKING_RADIUS,
        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
      },
    }}
  >
    {children}
  </Dialog>
);

// ── Данные гостя ─────────────────────────────────────────────────────────────

/**
 * Контакты гостя перед отправкой заявки. В эталоне здесь ФИО и телефон с
 * выбором страны — тем же составом полей, что уходит в бронь.
 */
export const GuestDialog: React.FC<{
  open: boolean;
  doctorName: string;
  choice: BookingChoice;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string, phone: string, comment: string) => void;
}> = ({ open, submitting, error, onClose, onSubmit }) => {
  const { t } = useT("publicBooking");
  // Справочник общий с формами CRM: витрине нужны те же страны и правила.
  // Список от бэка (пять стран с эмодзи-флагами) не используем: эмодзи не
  // рисуются на Windows, а стран нужно больше.
  const list = PHONE_COUNTRIES;
  const [countryQuery, setCountryQuery] = React.useState("");
  const [showAllCountries, setShowAllCountries] = React.useState(false);

  const [country, setCountry] = React.useState<PhoneCountryInfo>(
    () => list.find((c) => c.dialCode === "+996") ?? list[0],
  );
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [showNameError, setShowNameError] = React.useState(false);
  const [showPhoneError, setShowPhoneError] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const phoneRef = React.useRef<HTMLInputElement>(null);

  // Подставляем контакты прошлой записи и ставим фокус туда, где пусто.
  React.useEffect(() => {
    if (!open) return;
    const savedName = localStorage.getItem(SAVED_NAME_KEY);
    const savedPhone = localStorage.getItem(SAVED_PHONE_KEY);
    if (savedName) setName(savedName);
    if (savedPhone) {
      const matched = list.find((c) => savedPhone.startsWith(c.dialCode));
      if (matched) {
        setCountry(matched);
        setPhone(savedPhone.slice(matched.dialCode.length));
      }
    }
    const timer = setTimeout(() => {
      if (savedName) phoneRef.current?.focus();
      else nameRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Обычному пациенту нужны три страны; остальные прячем за «Другие страны»,
  // чтобы список не превращался в простыню, но и не выглядел ограниченным.
  const primaryCountries = React.useMemo(() => list.slice(0, PRIMARY_PHONE_COUNTRY_COUNT), [list]);
  const visibleCountries = React.useMemo(() => {
    if (!showAllCountries) return primaryCountries;
    const q = countryQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [list, primaryCountries, showAllCountries, countryQuery]);

  const nameOk = name.trim().length > 1;
  const phoneOk = isPhoneLocalComplete(country.dialCode, phone);
  // Ошибку показываем только после попытки отправить — подсказывать на каждой
  // набранной цифре навязчиво, номер и так набирается не сразу.
  const nameError = showNameError && !nameOk;
  const phoneError = showPhoneError && !phoneOk;

  const handleSubmit = () => {
    // Кнопка активна всегда: погашенная кнопка на незаполненной форме — тупик,
    // гость жмёт и не понимает, чего не хватает. Вместо этого подсвечиваем
    // первое незаполненное поле и ставим в него курсор.
    setShowNameError(!nameOk);
    setShowPhoneError(!phoneOk);
    if (!nameOk) {
      nameRef.current?.focus();
      return;
    }
    if (!phoneOk) {
      phoneRef.current?.focus();
      return;
    }
    if (submitting) return;
    const fullPhone = country.dialCode + phone.replace(/\D/g, "");
    const cleanName = capitalizeFullName(name.trim());
    localStorage.setItem(SAVED_NAME_KEY, cleanName);
    localStorage.setItem(SAVED_PHONE_KEY, fullPhone);
    onSubmit(cleanName, fullPhone, "");
  };

  const fieldSx = {
    width: "100%",
    border: `1px solid ${BORDER}`,
    borderRadius: "8px",
    p: 1.5,
    transition: "border-color .2s",
    "&:focus-within": { borderColor: BOOKING_PRIMARY },
  };
  const inputSx = {
    width: "100%",
    border: 0,
    outline: "none",
    fontFamily: "inherit",
    fontSize: 16,
    color: "text.primary",
    bgcolor: "transparent",
    "&::placeholder": { color: "#D0D5DD" },
  };

  return (
    <ModalPaper open={open} onClose={onClose} maxWidth={400}>
      <Stack alignItems="center" spacing={2} sx={{ p: 3 }}>
        <Typography sx={{ fontSize: 14, textAlign: "center", color: "#333", mb: 1 }}>
          {t("guestHintShort")}
        </Typography>

        <Box sx={{ ...fieldSx, ...(nameError ? { borderColor: "error.main" } : null) }}>
          <Box
            component="input"
            ref={nameRef}
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setName(e.target.value);
              if (e.target.value.trim().length > 1) setShowNameError(false);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder={t("nameLabel")}
            sx={inputSx}
          />
        </Box>

        {nameError && (
          <Typography sx={{ width: "100%", mt: -1, fontSize: 13, color: "error.main" }}>
            {t("nameRequired")}
          </Typography>
        )}

        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ ...fieldSx, ...(phoneError ? { borderColor: "error.main" } : null) }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ cursor: "pointer", flexShrink: 0 }}
          >
            <CountryFlag code={country.code} size={20} />
            <KeyboardArrowDownOutlined sx={{ fontSize: 16, color: MUTED }} />
          </Stack>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => {
              setMenuAnchor(null);
              setCountryQuery("");
              setShowAllCountries(false);
            }}
            slotProps={{ paper: { sx: { maxHeight: 320, width: 260 } } }}
          >
            {/* Поиск нужен только когда открыт полный список. */}
            {showAllCountries && (
            <Box sx={{ px: 1.5, pb: 1 }} onKeyDown={(e) => e.stopPropagation()}>
              <Box
                component="input"
                autoFocus
                value={countryQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCountryQuery(e.target.value)}
                placeholder={t("searchShort")}
                sx={{
                  width: "100%",
                  p: 1,
                  border: `1px solid ${BORDER}`,
                  borderRadius: "8px",
                  outline: "none",
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
              />
            </Box>
            )}
            {visibleCountries.map((c) => (
              <MenuItem
                key={`${c.code}-${c.dialCode}`}
                onClick={() => {
                  setCountry(c);
                  // Номер длиннее, чем принято в новой стране, обрезаем — иначе
                  // он молча уйдёт на бэк в неверном формате.
                  setPhone((prev) => normalizePhoneLocal(c.dialCode, prev));
                  setShowPhoneError(false);
                  setMenuAnchor(null);
                  setCountryQuery("");
                }}
              >
                <Box sx={{ mr: 1.5, display: "flex" }}>
                  <CountryFlag code={c.code} size={20} />
                </Box>
                <Typography sx={{ fontSize: 14, flexGrow: 1 }}>{c.name}</Typography>
                <Typography sx={{ fontSize: 13, color: MUTED }}>{c.dialCode}</Typography>
              </MenuItem>
            ))}
            {!showAllCountries && (
              <MenuItem
                onClick={() => setShowAllCountries(true)}
                sx={{ borderTop: `1px solid ${BORDER}`, mt: 0.5, pt: 1 }}
              >
                <PublicOutlined sx={{ mr: 1.5, fontSize: 20, color: MUTED }} />
                <Typography sx={{ fontSize: 14, color: BOOKING_PRIMARY, fontWeight: 500 }}>
                  {t("otherCountries")}
                </Typography>
              </MenuItem>
            )}
            {visibleCountries.length === 0 && (
              <Typography sx={{ px: 2, py: 1, fontSize: 13, color: MUTED }}>
                {t("noSpecialistsFoundHint")}
              </Typography>
            )}
          </Menu>

          <Typography sx={{ fontSize: 16, fontWeight: 500, flexShrink: 0 }}>
            {country.dialCode}
          </Typography>

          <Box
            component="input"
            ref={phoneRef}
            type="tel"
            name="phone"
            autoComplete="tel"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const parsed = parsePhoneInput(country.dialCode, e.target.value);
              const nextCountry = list.find((c) => c.dialCode === parsed.countryCode);
              if (nextCountry) setCountry(nextCountry);
              setPhone(parsed.local);
              if (isPhoneLocalComplete(parsed.countryCode, parsed.local)) setShowPhoneError(false);
            }}
            onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
              // Вставленный номер может прийти с кодом страны («+996 700…»,
              // «996700123456») или чужой страны — тогда переключаем и её.
              e.preventDefault();
              const pasted = e.clipboardData.getData("text");
              const parsed = parsePastedPhone(country.dialCode, pasted);
              const nextCountry = list.find((c) => c.dialCode === parsed.countryCode);
              if (nextCountry) setCountry(nextCountry);
              setPhone(parsed.local);
              if (isPhoneLocalComplete(parsed.countryCode, parsed.local)) setShowPhoneError(false);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder={phonePlaceholder(country.dialCode)}
            sx={{ ...inputSx, flexGrow: 1, minWidth: 0 }}
          />
        </Stack>

        {phoneError && (
          <Typography sx={{ width: "100%", mt: -1, fontSize: 13, color: "error.main" }}>
            {getPhoneExactLength(country.dialCode) != null
              ? t("phoneDigitsRequired", { count: getPhoneExactLength(country.dialCode) as number })
              : t("phoneRequired")}
          </Typography>
        )}

        {error && (
          <Typography sx={{ width: "100%", fontSize: 14, color: "error.main", textAlign: "center" }}>
            {error}
          </Typography>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          disableElevation
          sx={{
            mt: 1,
            width: "100%",
            py: 1.75,
            borderRadius: PILL_RADIUS,
            fontSize: 16,
            fontWeight: 600,
            color: "#FFFFFF",
            bgcolor: BOOKING_PRIMARY,
            "&:hover": { bgcolor: BOOKING_PRIMARY_HOVER },
            "&.Mui-disabled": { bgcolor: BOOKING_PRIMARY, color: "#FFFFFF", opacity: 0.6 },
          }}
        >
          {submitting ? t("sending") : t("continueAction")}
        </Button>
      </Stack>
    </ModalPaper>
  );
};

// ── Подтверждение записи ─────────────────────────────────────────────────────

/** Дата в подтверждении: «15.03.2026 (Чт)» — формат эталона. */
function formatConfirmDate(date: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  const weekday = new Date(`${date}T00:00:00`)
    .toLocaleDateString("ru-RU", { weekday: "short" })
    .replace(".", "");
  return `${d}.${m}.${y} (${weekday.charAt(0).toUpperCase()}${weekday.slice(1)})`;
}

/** Строка «подпись → значение» с иконкой. */
const FactRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({
  icon,
  label,
  value,
}) => (
  <Stack direction="row" alignItems="flex-start" spacing={1}>
    <Box sx={{ display: "flex", color: "text.primary", mt: "2px" }}>{icon}</Box>
    <Typography
      sx={{
        fontSize: { xs: 12, lg: 14 },
        color: "text.secondary",
        width: { xs: 96, lg: 112 },
        flexShrink: 0,
      }}
    >
      {label}
    </Typography>
    <Typography sx={{ fontSize: 14, fontWeight: 500, minWidth: 0, wordBreak: "break-word" }}>
      {value}
    </Typography>
  </Stack>
);

/** Фото врача с плашкой специализации — правая колонка подтверждения. */
const DoctorBadge: React.FC<{ doctor: ProfessionalDetail; specialty: string }> = ({
  doctor,
  specialty,
}) => {
  const [broken, setBroken] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !broken;

  return (
    <>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: { xs: 161, lg: 209 },
          borderRadius: TILE_RADIUS,
          overflow: "hidden",
          bgcolor: BOOKING_PRIMARY,
        }}
      >
        {showPhoto ? (
          <Box
            component="img"
            src={doctor.photoUrl ?? undefined}
            alt={doctor.fullName}
            onError={() => setBroken(true)}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Stack alignItems="center" justifyContent="center" sx={{ width: "100%", height: "100%" }}>
            <Typography sx={{ color: "#FFFFFF", fontSize: 36, fontWeight: 600 }}>
              {doctor.fullName.charAt(0).toUpperCase()}
            </Typography>
          </Stack>
        )}
        {specialty && (
          <Box
            sx={{
              position: "absolute",
              right: 0,
              bottom: 0,
              px: 1,
              py: 0.75,
              borderTopLeftRadius: TILE_RADIUS,
              bgcolor: "background.paper",
              color: "text.secondary",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {specialty}
          </Box>
        )}
      </Box>
      <Typography sx={{ mt: 1, fontSize: 14, fontWeight: 500, textAlign: "center" }}>
        {doctor.fullName}
      </Typography>
    </>
  );
};

/**
 * Подтверждение записи: слева время, дата, услуги и адрес, справа врач и QR с
 * номером брони, который показывают на ресепшене.
 */
export const SuccessDialog: React.FC<{
  result: GuestBookingResult;
  doctor: ProfessionalDetail;
  services: PickableService[];
  onClose: () => void;
}> = ({ result, doctor, services, onClose }) => {
  const { t } = useT("publicBooking");
  // Ссылка уходит наружу (QR, «Поделиться») — клинику в ней теряем.
  const orgSlug = useBookingOrgSlug();
  const [shareLabel, setShareLabel] = React.useState<string | null>(null);
  const specialty = doctor.specialties[0] ?? "";

  // POST отдаёт только код, статус, дату и время — состав, сумму и адрес
  // дочитываем по коду. Пока запрос идёт (или если он не удался), показываем то,
  // что выбрал гость: экран не должен ждать сеть, чтобы что-то показать.
  const [detail, setDetail] = React.useState<PublicBookingDetail | null>(null);
  React.useEffect(() => {
    if (!result.confirmationCode) return;
    const ctrl = new AbortController();
    getBookingByCode(result.confirmationCode, ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setDetail(d);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [result.confirmationCode]);

  /** Ссылка на карточку записи — её и кодирует QR, и отправляет «Поделиться». */
  const bookingUrl = bookingCodeUrl(result.confirmationCode, orgSlug);

  const serviceNames = (
    detail?.services.length ? detail.services.map((s) => s.name) : services.map((s) => s.name)
  ).join(", ");
  const totalPrice = Number(detail?.totalPrice ?? 0);
  const address = detail?.branch?.address ?? doctor.branch?.address ?? "";

  const handleShare = async () => {
    const text = [
      t("successTitle"),
      `${doctor.fullName}${specialty ? ` · ${specialty}` : ""}`,
      `${formatConfirmDate(result.date)} ${result.time}`,
      address,
      `${t("confirmationCode")}: ${result.confirmationCode}`,
      bookingUrl,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) await navigator.share({ title: t("successTitle"), text });
      else {
        await navigator.clipboard.writeText(text);
        setShareLabel(t("copied"));
        setTimeout(() => setShareLabel(null), 2000);
      }
    } catch {
      // пользователь отменил — ничего не делаем
    }
  };

  const qrBlock = result.confirmationCode ? (
    <Box sx={{ width: "100%" }}>
      <Stack
        alignItems="center"
        sx={{ p: 1, border: `1px solid ${BORDER}`, borderRadius: TILE_RADIUS }}
      >
        {/* QR ведёт на страницу записи: пациент сканирует своим телефоном и
            открывает карточку, администратор — сканирует ту же и видит бронь.
            Голый код в QR читался как непонятная строка. */}
        <QRCode value={bookingUrl} size={136} level="M" />
      </Stack>
      <Typography sx={{ mt: 0.75, fontSize: 14, fontWeight: 500, textAlign: "center" }}>
        {result.confirmationCode}
      </Typography>
      <Button
        onClick={handleShare}
        startIcon={<ShareOutlined sx={{ fontSize: 15 }} />}
        sx={{
          mt: 1.5,
          width: "100%",
          py: 1,
          borderRadius: PILL_RADIUS,
          border: `1px solid ${BOOKING_PRIMARY}`,
          color: BOOKING_PRIMARY,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {shareLabel ?? t("share")}
      </Button>
    </Box>
  ) : null;

  return (
    <ModalPaper open onClose={onClose} maxWidth={828}>
      <IconButton
        onClick={onClose}
        aria-label="Закрыть"
        sx={{ position: "absolute", top: 8, right: 8, zIndex: 1, color: MUTED }}
      >
        <CloseOutlined />
      </IconButton>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 240px" },
          gap: { xs: 2, lg: 3 },
          p: { xs: 2, lg: 5 },
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ pb: { xs: 1, lg: 0 }, borderBottom: { xs: `1px solid ${BORDER}`, lg: "none" } }}
          >
            <CheckCircleOutlined sx={{ fontSize: { xs: 24, lg: 34 }, color: "#34C759" }} />
            <Box>
              {/* Бронь создаётся в статусе pending: подтверждает её персонал,
                  поэтому «принята», а не «подтверждена». */}
              <Typography sx={{ fontSize: { xs: 16, lg: 22 }, fontWeight: 600, color: "#34C759" }}>
                {t("successTitle")}
              </Typography>
              <Typography sx={{ fontSize: { xs: 12, lg: 14 }, color: MUTED }}>
                {t("successHint")}
              </Typography>
            </Box>
          </Stack>

          {/* На мобильном врач и QR идут сразу под заголовком. */}
          <Box sx={{ display: { lg: "none" } }}>
            <DoctorBadge doctor={doctor} specialty={specialty} />
          </Box>

          <Box sx={{ borderTop: `1px solid ${BORDER}` }}>
            <Stack
              direction="row"
              divider={<Box sx={{ borderRight: `1px solid ${BORDER}`, mx: 2 }} />}
              sx={{ py: { xs: 1, lg: 2 } }}
            >
              <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ flexShrink: 0 }}>
                <ScheduleOutlined sx={{ fontSize: { xs: 16, lg: 22 }, mt: "2px" }} />
                <Box>
                  <Typography sx={{ fontSize: { xs: 12, lg: 14 }, lineHeight: 1.3 }}>
                    {t("successTime")}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 16, lg: 18 }, fontWeight: 500 }}>
                    {result.time}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
                <EventOutlined sx={{ fontSize: { xs: 16, lg: 22 }, mt: "2px" }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: { xs: 12, lg: 14 }, lineHeight: 1.3 }}>
                    {t("successDate")}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 16, lg: 18 }, fontWeight: 500 }}>
                    {formatConfirmDate(result.date)}
                  </Typography>
                </Box>
              </Stack>
            </Stack>

            <Stack spacing={1} sx={{ py: { xs: 1, lg: 2 }, borderTop: `1px solid ${BORDER}` }}>
              <FactRow
                icon={<MedicalServicesOutlined sx={{ fontSize: { xs: 16, lg: 22 } }} />}
                label={t("successService")}
                value={serviceNames || "—"}
              />
              {specialty && (
                <FactRow
                  icon={<Box sx={{ width: { xs: 16, lg: 22 } }} />}
                  label={t("successSpecialty")}
                  value={specialty}
                />
              )}
              {totalPrice > 0 && (
                <FactRow
                  icon={<Box sx={{ width: { xs: 16, lg: 22 } }} />}
                  label={t("successTotal")}
                  value={formatPrice(totalPrice)}
                />
              )}
            </Stack>

            {address && (
              <Stack
                direction="row"
                alignItems="flex-start"
                spacing={1}
                sx={{ py: { xs: 1, lg: 2 }, borderTop: `1px solid ${BORDER}` }}
              >
                <PlaceOutlined sx={{ fontSize: { xs: 16, lg: 22 } }} />
                <Box>
                  <Typography sx={{ fontSize: { xs: 12, lg: 14 }, mb: 0.5 }}>
                    {t("successAddress")}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 12, lg: 14 }, fontWeight: 500 }}>
                    {address}
                  </Typography>
                </Box>
              </Stack>
            )}
          </Box>

          <Stack component="ul" sx={{ pl: 2, m: 0, gap: 0.5 }}>
            <Typography component="li" sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("reminderOnTime")}
            </Typography>
            <Typography component="li" sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("reminderCancel")}
            </Typography>
          </Stack>

          <Box sx={{ display: { lg: "none" } }}>{qrBlock}</Box>
        </Stack>

        {/* Правая колонка — только на десктопе */}
        <Stack
          alignItems="center"
          spacing={3}
          sx={{
            display: { xs: "none", lg: "flex" },
            pl: 3,
            borderLeft: `1px solid ${BORDER}`,
            justifyContent: "center",
          }}
        >
          <Box sx={{ width: "100%" }}>
            <DoctorBadge doctor={doctor} specialty={specialty} />
          </Box>
          {qrBlock}
        </Stack>
      </Box>
    </ModalPaper>
  );
};
