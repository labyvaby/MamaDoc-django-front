import React from "react";
import { Box, Button, Collapse, Dialog, IconButton, Menu, MenuItem, Stack, Typography } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PendingOutlined from "@mui/icons-material/PendingOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
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
import { PaymentBlock } from "../BookingByCodePage";
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
  /** Оплата не прошла (истекла/отклонена) — «Записаться на другое время». */
  onRetry?: () => void;
}> = ({ result, doctor, services, onClose, onRetry }) => {
  const { t } = useT("publicBooking");
  // Ссылка уходит наружу (QR, «Поделиться») — клинику в ней теряем.
  const orgSlug = useBookingOrgSlug();
  const [shareLabel, setShareLabel] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
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

  /**
   * Пока предоплата в статусе pending, опрашиваем ту же ручку, что и страница
   * «Ваша запись» — кнопка банка «Я оплатил(а)» ничего не доказывает, признак
   * оплаты один — status "paid".
   */
  const paymentStatus = detail?.payment?.status ?? null;

  /**
   * Пока предоплата не пришла, заголовок не должен обещать «Запись принята!» —
   * без оплаты бронь снимется через 15 минут, и зелёная галочка была ложной
   * (жалоба заказчика 08.09.2026: гость видел успех даже без оплаты).
   *
   * До ответа `getBookingByCode` (`detail` ещё `null`) уже известно из самого
   * POST, нужна ли оплата — `result.status === "awaiting_payment"`. Без этого
   * запасного варианта первый рендер показывал старое «Запись принята!», а
   * через долю секунды подменялся на «Ждём оплату» — заметная перерисовка
   * (жалоба заказчика 08.09.2026: «сначала прогружается прошлая версия, а
   * потом новая»). «Не получилось» же можно узнать только из `detail` —
   * до его ответа считаем брони поступившей.
   */
  const headerTone: "accepted" | "pending" | "issue" = detail?.payment
    ? detail.payment.status === "pending"
      ? "pending"
      : detail.payment.status === "expired" || detail.payment.status === "failed"
        ? "issue"
        : "accepted"
    : result.status === "awaiting_payment"
      ? "pending"
      : "accepted";

  React.useEffect(() => {
    if (paymentStatus !== "pending" || !result.confirmationCode) return;
    const ctrl = new AbortController();
    const id = window.setInterval(() => {
      getBookingByCode(result.confirmationCode, ctrl.signal)
        .then((d) => {
          if (!ctrl.signal.aborted) setDetail(d);
        })
        .catch(() => {
          /* сеть моргнула — повторим на следующем тике */
        });
    }, 5000);
    return () => {
      window.clearInterval(id);
      ctrl.abort();
    };
  }, [paymentStatus, result.confirmationCode]);

  /** Ссылка на карточку записи — её и кодирует QR, и отправляет «Поделиться». */
  const bookingUrl = bookingCodeUrl(result.confirmationCode, orgSlug);

  const serviceNames = (
    detail?.services.length ? detail.services.map((s) => s.name) : services.map((s) => s.name)
  ).join(", ");
  const totalPrice = Number(detail?.totalPrice ?? 0);
  const address = detail?.branch?.address ?? doctor.branch?.address ?? "";
  const branchName = detail?.branch?.name ?? doctor.branch?.name ?? "";

  /**
   * Ссылки на карты филиала — те же, что на странице брони по коду.
   *
   * Адрес строкой пациент всё равно копирует в карты руками, а на телефоне это
   * ещё и неудобно. Ссылки заводит клиника в настройках филиала, и они уже
   * приходят в ответе брони — здесь их просто не выводили.
   */
  const mapLinks = detail?.branch
    ? (
        [
          { url: detail.branch.twoGisUrl, label: "2ГИС" },
          { url: detail.branch.yandexMapsUrl, label: t("byCode.yandexMaps") },
          { url: detail.branch.googleMapsUrl, label: t("byCode.googleMaps") },
        ] as const
      ).filter((m): m is { url: string; label: string } => Boolean(m.url))
    : [];

  /**
   * Бронь принята ≠ подтверждена: её создают в статусе `pending`, и
   * подтверждает персонал звонком. Страница брони по коду это показывала
   * честным чипом «Ожидает подтверждения», а здесь стояла зелёная галочка и
   * «Запись принята!» — два экрана про одну бронь говорили разное, и пациент
   * не понимал, что нужно дождаться звонка (жалоба заказчика 08.09.2026).
   *
   * Читаем реальный статус, а не предполагаем: если клиника включит
   * автоподтверждение, экран станет верным сам. Начальное значение берём из
   * ответа POST — до `getBookingByCode` заголовок не мигает.
   */
  const confirmed = (detail?.status ?? result.status) === "confirmed";

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

  /**
   * Пока бронь не подтверждена (ждём оплату / оплата не прошла) — отдельный,
   * узкий экран-чекаут: главное действие (оплатить / записаться заново) и
   * ничего лишнего вокруг. Фото врача, QR и «Поделиться» тут неуместны (см.
   * `qrBlock` выше) — карточка записи с фактами спрятана под «Детали записи»
   * и открывается по желанию. Экран-витрину с фото и QR показываем только
   * когда бронь реально принята — см. return ниже.
   */
  if (headerTone !== "accepted") {
    const pending = headerTone === "pending";
    const issueHint = paymentStatus === "failed" ? t("byCode.payFailed") : t("byCode.payExpired");

    return (
      <ModalPaper open onClose={onClose} maxWidth={420}>
        <IconButton
          onClick={onClose}
          aria-label="Закрыть"
          sx={{ position: "absolute", top: 8, right: 8, color: MUTED }}
        >
          <CloseOutlined />
        </IconButton>

        <Stack alignItems="center" spacing={1.5} sx={{ p: { xs: 3, lg: 4 }, textAlign: "center" }}>
          {pending ? (
            <PendingOutlined sx={{ fontSize: 40, color: "warning.main" }} />
          ) : (
            <ErrorOutlineOutlined sx={{ fontSize: 40, color: "error.main" }} />
          )}
          <Typography
            sx={{ fontSize: 20, fontWeight: 700, color: pending ? "warning.main" : "error.main" }}
          >
            {pending ? t("successTitlePending") : t("successTitleIssue")}
          </Typography>
          {!pending && (
            <Typography sx={{ fontSize: 13, color: MUTED }}>{issueHint}</Typography>
          )}

          {pending &&
            (detail?.payment ? (
              <Box sx={{ width: "100%" }}>
                <PaymentBlock payment={detail.payment} t={t} compact />
              </Box>
            ) : (
              // Строка результата POST уже подтверждает статус — само тело
              // оплаты (сумма/ссылка) досылается следующим ответом по коду.
              <Typography sx={{ fontSize: 13, color: MUTED }}>{t("sending")}</Typography>
            ))}

          {!pending && onRetry && (
            <Button
              onClick={onRetry}
              sx={{
                width: "100%",
                py: 1.5,
                borderRadius: PILL_RADIUS,
                fontSize: 15,
                fontWeight: 600,
                color: "#FFFFFF",
                bgcolor: BOOKING_PRIMARY,
                textTransform: "none",
                "&:hover": { bgcolor: BOOKING_PRIMARY_HOVER },
              }}
            >
              {t("successRetry")}
            </Button>
          )}

          <Button
            onClick={() => setDetailsOpen((v) => !v)}
            endIcon={
              <ExpandMoreOutlined
                sx={{
                  fontSize: 18,
                  transform: detailsOpen ? "rotate(180deg)" : "none",
                  transition: "transform .2s",
                }}
              />
            }
            sx={{ textTransform: "none", color: MUTED, fontSize: 13 }}
          >
            {t("successDetailsToggle")}
          </Button>

          <Collapse in={detailsOpen} sx={{ width: "100%" }}>
            <Stack
              spacing={1.25}
              sx={{ pt: 1.5, mt: -0.5, borderTop: `1px solid ${BORDER}`, textAlign: "left" }}
            >
              <FactRow
                icon={<PersonOutlineOutlined sx={{ fontSize: 20 }} />}
                label={t("successDoctor")}
                value={`${doctor.fullName}${specialty ? ` · ${specialty}` : ""}`}
              />
              <FactRow
                icon={<ScheduleOutlined sx={{ fontSize: 20 }} />}
                label={t("successTime")}
                value={result.time}
              />
              <FactRow
                icon={<EventOutlined sx={{ fontSize: 20 }} />}
                label={t("successDate")}
                value={formatConfirmDate(result.date)}
              />
              <FactRow
                icon={<MedicalServicesOutlined sx={{ fontSize: 20 }} />}
                label={t("successService")}
                value={serviceNames || "—"}
              />
              {totalPrice > 0 && (
                <FactRow
                  icon={<Box sx={{ width: 20 }} />}
                  label={t("successTotal")}
                  value={formatPrice(totalPrice)}
                />
              )}
              {(address || branchName) && (
                <FactRow
                  icon={<PlaceOutlined sx={{ fontSize: 20 }} />}
                  label={t("successAddress")}
                  value={[branchName, address].filter(Boolean).join(" · ")}
                />
              )}
            </Stack>
          </Collapse>
        </Stack>
      </ModalPaper>
    );
  }

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
            {/* Экран рисуется, когда предоплаты нет или она уже пришла (см.
                ранний return выше). Тон — по статусу самой брони: зелёная
                галочка только для подтверждённой, иначе часы и явное
                ожидание. */}
            {confirmed ? (
              <CheckCircleOutlined sx={{ fontSize: { xs: 24, lg: 34 }, color: "#34C759" }} />
            ) : (
              <PendingOutlined sx={{ fontSize: { xs: 24, lg: 34 }, color: "warning.main" }} />
            )}
            <Box>
              <Typography
                sx={{
                  fontSize: { xs: 16, lg: 22 },
                  fontWeight: 600,
                  color: confirmed ? "#34C759" : "warning.main",
                }}
              >
                {confirmed ? t("successTitleConfirmed") : t("successTitle")}
              </Typography>
              <Typography sx={{ fontSize: { xs: 12, lg: 14 }, color: MUTED }}>
                {confirmed ? t("successHintConfirmed") : t("successHint")}
              </Typography>
            </Box>
          </Stack>

          {/* Ожидание подтверждения — не мелкой подписью, а тем же чипом, что
              и на странице брони: пациент должен понять, что запись ещё не
              окончательная, не вчитываясь. */}
          {!confirmed && (
            <Box
              sx={{
                alignSelf: "flex-start",
                px: 1.25,
                py: 0.5,
                borderRadius: 99,
                bgcolor: "warning.main",
                color: "#FFFFFF",
                fontSize: { xs: 12, lg: 13 },
                fontWeight: 600,
              }}
            >
              {t("my.statusPending")}
            </Box>
          )}

          {/* На мобильном врач и QR идут сразу под заголовком. */}
          <Box sx={{ display: { lg: "none" } }}>
            <DoctorBadge doctor={doctor} specialty={specialty} />
          </Box>

          {/* Оплата уже пришла (после prepayment) — компактное подтверждение
              «Оплата получена» рядом с остальными фактами, не заголовком. */}
          {detail?.payment && <PaymentBlock payment={detail.payment} t={t} />}

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

            {(address || branchName) && (
              <Stack
                direction="row"
                alignItems="flex-start"
                spacing={1}
                sx={{ py: { xs: 1, lg: 2 }, borderTop: `1px solid ${BORDER}` }}
              >
                <PlaceOutlined sx={{ fontSize: { xs: 16, lg: 22 }, mt: "2px" }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: { xs: 12, lg: 14 }, mb: 0.5 }}>
                    {t("successAddress")}
                  </Typography>
                  {/* Филиал отдельной строкой: у клиники их несколько, и по
                      одной улице пациент не понимает, куда именно ехать. */}
                  {branchName && (
                    <Typography sx={{ fontSize: { xs: 13, lg: 15 }, fontWeight: 600 }}>
                      {branchName}
                    </Typography>
                  )}
                  {address && (
                    <Typography sx={{ fontSize: { xs: 12, lg: 14 }, fontWeight: 500 }}>
                      {address}
                    </Typography>
                  )}
                  {mapLinks.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                      {mapLinks.map((m) => (
                        <Button
                          key={m.label}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          startIcon={<MapOutlined sx={{ fontSize: 16 }} />}
                          sx={{
                            borderRadius: PILL_RADIUS,
                            px: 1.5,
                            border: `1px solid ${BORDER}`,
                            color: "text.primary",
                            fontSize: 13,
                            textTransform: "none",
                          }}
                        >
                          {m.label}
                        </Button>
                      ))}
                    </Stack>
                  )}
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
