import React from "react";
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import { useSearchParams } from "react-router";

import {
  getProfessionalCalendar,
  getProfessionals,
  idOrSlugRef,
  type CalendarDay,
  type ProfessionalPreview,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
import { PublicBookingShell } from "./shell";
import { SpecialtyTile } from "./SpecialtiesPage";
import { useSpecialties, type SpecialtyGroup } from "./useSpecialties";
import { useBookingNav } from "./orgSlug";
import { primaryPhone, useBookingOrg } from "./useBookingOrg";
import { formatDayMonth, isoInDays, telHref, todayIso } from "./format";
import {
  BOOKING_PRIMARY,
  BOOKING_PRIMARY_HOVER,
  BOOKING_RADIUS,
  BORDER,
  TILE_RADIUS,
  nearestTone,
} from "./theme";
import { useT } from "../../i18n/VerticalProvider";

/** Сколько окон помещается в карточку до счётчика «+N». */
const SLOTS_PREVIEW = 3;

/*
 * Резерв высоты под переменные части карточки. Без него карточки в списке
 * получаются разной высоты: ФИО занимает одну или две строки, специализация
 * может отсутствовать, а строка окон — одну строку («окон нет», скелетон) или
 * две (метка над чипами на узком экране). В горизонтальной раскладке высоту
 * карточки диктует именно этот текст, и разнобой сразу виден.
 */

/** Две строки ФИО при lineHeight 1.35. */
const NAME_MIN_H = "2.7em";
/** Строка специализации. */
const SPECIALTY_MIN_H = 18;
/** Строка окон: на узком экране метка над чипами, на широком — в один ряд. */
const SLOTS_MIN_H = { xs: 44, lg: 24 };
/**
 * Весь низ карточки: строка окон с отступами (10 + SLOTS_MIN_H + 8) и кнопка
 * (~31). Врач без окон показывает вместо этого обведённый блок со звонком —
 * резерв держит обе карточки в сетке одной высоты.
 */
const ACTION_AREA_MIN_H = { xs: 93, lg: 73 };

// ── Ближайшие свободные окна ─────────────────────────────────────────────────

/**
 * Ближайшие окна врача для карточки списка.
 *
 * Список врачей (`ProfessionalPreview`) свободных окон не содержит — их
 * приходится добирать календарём по каждому врачу отдельно. Чтобы не пускать
 * сотню запросов на клинику со ста врачами, грузим только когда карточка
 * появилась в зоне видимости, и один раз на карточку.
 *
 * ⚠ Правильное решение — отдавать ближайшие окна прямо в списке врачей; на бэке
 * такого поля нет (см. `MamaDoc/backend_ticket_public_booking_phase3.md`).
 */
function useNearestDay(idOrSlug: string | number) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [day, setDay] = React.useState<CalendarDay | null | undefined>(undefined);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controller = new AbortController();
    let started = false;

    const load = () => {
      if (started) return;
      started = true;
      getProfessionalCalendar(
        idOrSlug,
        { dateFrom: todayIso(), dateTo: isoInDays(13) },
        controller.signal,
      )
        .then((days) => setDay(days.find((d) => d.isAvailable && d.times.length > 0) ?? null))
        .catch((e) => {
          // Календарь — дополнение к карточке: молча прячем строку окон, чтобы
          // ошибка одного врача не ломала весь список.
          if (!isAbortError(e)) setDay(null);
        });
    };

    // IntersectionObserver может быть недоступен (старые вебвью) — тогда просто
    // грузим сразу: хуже по трафику, но карточка не останется пустой.
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => controller.abort();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [idOrSlug]);

  return { ref, day };
}

/**
 * Строка ближайших окон. Цвет кодирует «насколько скоро»: сегодня зелёный,
 * завтра синий, дальняя дата серая. На узком экране метка разворачивается в
 * «Свободные окна …», на широком остаётся короткой — как в эталоне.
 */
const AvailabilityRow: React.FC<{ day: CalendarDay | null | undefined; onMore: () => void }> = ({
  day,
  onMore,
}) => {
  const { t } = useT("publicBooking");

  // Общая геометрия всех состояний строки: место под окна зарезервировано
  // одинаково, даже когда окон нет или они ещё грузятся.
  const boxSx = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minHeight: SLOTS_MIN_H,
    mt: 1.25,
    mb: 1,
  } as const;

  if (day === undefined)
    return (
      <Box sx={boxSx}>
        <Skeleton width="85%" height={18} />
      </Box>
    );
  if (!day) {
    return (
      <Box sx={boxSx}>
        {/* Единственная строка карточки без окон — по центру над кнопкой, как в
            макете. Сюда попадают врачи без окон у клиники без телефона: со
            звонком строка и кнопка собираются отдельным блоком ниже. */}
        <Typography sx={{ fontSize: 12, textAlign: "center" }}>{t("freeSlotsNone")}</Typography>
      </Box>
    );
  }

  const isToday = day.date === todayIso();
  const isTomorrow = day.date === isoInDays(1);
  const isSpecial = isToday || isTomorrow;
  const tone = isToday ? nearestTone.today : isTomorrow ? nearestTone.tomorrow : nearestTone.later;

  const shown = day.times.slice(0, SLOTS_PREVIEW);
  const rest = day.times.length - shown.length;

  return (
    <Stack
      direction={{ xs: "column", lg: "row" }}
      alignItems={{ lg: "center" }}
      spacing={{ xs: 0.5, lg: 0.75 }}
      sx={{ ...boxSx, justifyContent: { xs: "center", lg: "flex-start" } }}
    >
      <Box
        sx={{
          flexShrink: 0,
          fontSize: { xs: 12, lg: 10 },
          fontWeight: isSpecial ? 500 : 600,
          color: tone.label,
          whiteSpace: "nowrap",
          // Дальняя дата на широком экране показывается чипом с рамкой.
          ...(isSpecial
            ? null
            : {
                display: { lg: "inline-block" },
                border: { lg: `1px solid ${tone.label}` },
                borderRadius: { lg: 999 },
                px: { lg: 0.5 },
                py: { lg: 0.25 },
              }),
        }}
      >
        <Box component="span" sx={{ display: { lg: "none" } }}>
          {isToday
            ? t("freeSlotsToday")
            : isTomorrow
              ? t("freeSlotsTomorrow")
              : t("freeSlotsOn", { date: formatDayMonth(day.date) })}
        </Box>
        <Box component="span" sx={{ display: { xs: "none", lg: "inline" } }}>
          {isToday
            ? t("freeSlotsTodayShort")
            : isTomorrow
              ? t("freeSlotsTomorrowShort")
              : formatDayMonth(day.date)}
        </Box>
      </Box>

      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.25} sx={{ minWidth: 0, overflow: "hidden" }}>
          {shown.map((time) => (
            <Box
              key={time}
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 999,
                fontSize: { xs: 12, lg: 10 },
                fontWeight: 500,
                whiteSpace: "nowrap",
                bgcolor: tone.chipBg,
                color: tone.chipText,
              }}
            >
              {time}
            </Box>
          ))}
        </Stack>
        {rest > 0 && (
          <Box
            component="button"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
            sx={{
              ml: "auto",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              px: 1,
              py: 0.25,
              border: 0,
              cursor: "pointer",
              borderRadius: 999,
              bgcolor: "#A0A0A0",
              color: "#FFFFFF",
              fontFamily: "inherit",
              fontSize: { xs: 12, lg: 10 },
              fontWeight: 500,
            }}
          >
            +{rest}
          </Box>
        )}
      </Stack>
    </Stack>
  );
};

// ── Карточка врача ───────────────────────────────────────────────────────────

/** Кнопка «Записаться» внизу карточки. */
const cardActionSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  boxSizing: "border-box",
  py: 0.75,
  px: 1,
  border: "1px solid",
  borderRadius: 999,
  fontFamily: "inherit",
  fontSize: 12,
  lineHeight: 1.43,
  textAlign: "center",
} as const;

const DoctorCardItem: React.FC<{
  doctor: ProfessionalPreview;
  clinicPhone: string | null;
  onOpen: () => void;
}> = ({ doctor, clinicPhone, onOpen }) => {
  const { t } = useT("publicBooking");
  const { ref, day } = useNearestDay(idOrSlugRef(doctor));
  const [photoBroken, setPhotoBroken] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !photoBroken;
  /**
   * Окон на две недели вперёд нет: онлайн-запись предлагать нечего, поэтому
   * вместо «Записаться» уводим на телефон клиники. Без телефона уводить некуда —
   * остаётся обычная кнопка, карточка врача покажет расписание целиком.
   */
  const callHref = day === null && clinicPhone ? telHref(clinicPhone) : null;

  return (
    <Box
      ref={ref}
      onClick={onOpen}
      sx={{
        display: "flex",
        flexDirection: { xs: "row", lg: "column" },
        width: "100%",
        maxWidth: { lg: 230 },
        overflow: "hidden",
        borderRadius: TILE_RADIUS,
        bgcolor: "background.paper",
        border: `1px solid ${BORDER}`,
        cursor: "pointer",
        transition: "transform .1s",
        "&:active": { transform: "scale(0.97)" },
      }}
    >
      {/* Фото: на телефоне узкая колонка слева, на десктопе — во всю ширину */}
      <Box
        sx={{
          position: "relative",
          width: { xs: 129, lg: "100%" },
          height: { lg: 209 },
          flexShrink: 0,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          bgcolor: "#007BFF",
        }}
      >
        {showPhoto ? (
          <Box
            component="img"
            src={doctor.photoUrl ?? undefined}
            alt={doctor.fullName}
            loading="lazy"
            onError={() => setPhotoBroken(true)}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Stack alignItems="center" justifyContent="center" sx={{ width: "100%" }}>
            <Typography sx={{ color: "#FFFFFF", fontSize: 34, fontWeight: 600, lineHeight: 1 }}>
              {doctor.fullName.charAt(0).toUpperCase()}
            </Typography>
          </Stack>
        )}

        {/* Плашка специализации — только на десктопе: на узком фото она
            наезжает на снимок и обрезается. */}
        {doctor.specialty && (
          <Box
            sx={{
              display: { xs: "none", lg: "inline" },
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
            {doctor.specialty}
          </Box>
        )}
      </Box>

      <Stack sx={{ flexGrow: 1, minWidth: 0, p: 1.25 }}>
        <Box>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.35,
              minHeight: NAME_MIN_H,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {doctor.fullName}
          </Typography>
          {/* Строка занимает место и у врача без специализации — иначе его
              карточка ниже соседних. */}
          <Typography
            noWrap
            sx={{
              display: { lg: "none" },
              minHeight: SPECIALTY_MIN_H,
              fontSize: 12,
              fontWeight: 600,
              color: "text.secondary",
            }}
          >
            {doctor.specialty || " "}
          </Typography>
        </Box>

        {/* Низ карточки: строка окон и кнопка. Высота зарезервирована целиком —
            состояния «есть окна» и «нет окон» верстаются по-разному, а карточки
            в сетке должны остаться одной высоты. Без `overflow: hidden`: рамка
            блока «нет окон» вынесена на отрицательные поля и обрезалась бы по
            бокам; лишние чипы прячет сама строка окон. */}
        <Box
          sx={{
            mt: "auto",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: ACTION_AREA_MIN_H,
          }}
        >
          {callHref ? (
            // Макет «нет окон»: подпись и кнопка звонка — один обведённый блок.
            // Рамка обнимает кнопку вплотную и вынесена наружу отрицательными
            // полями, чтобы её толщина не съедала ширину кнопки: «Связаться с
            // клиникой» должна совпадать с «Записаться» в соседних карточках.
            <Box
              sx={{
                mt: "auto",
                mx: "-1px",
                display: "flex",
                flexDirection: "column",
                border: "1px solid #C7C7C7",
                borderRadius: BOOKING_RADIUS,
              }}
            >
              <Typography
                sx={{
                  py: 0.75,
                  px: 1,
                  fontSize: 12,
                  lineHeight: "18px",
                  textAlign: "center",
                }}
              >
                {t("freeSlotsNone")}
              </Typography>
              <Box
                component="a"
                href={callHref}
                // Клик по кнопке не должен заодно открывать карточку врача.
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                sx={{
                  // Та же геометрия, что у «Записаться»: обе кнопки в ленте
                  // карточек должны читаться как одна и та же кнопка.
                  ...cardActionSx,
                  borderColor: "transparent",
                  bgcolor: BOOKING_PRIMARY,
                  color: "#FFFFFF",
                  fontWeight: 500,
                  textDecoration: "none",
                  "&:hover": { bgcolor: BOOKING_PRIMARY_HOVER },
                }}
              >
                {t("contactClinic")}
              </Box>
            </Box>
          ) : (
            <>
              <AvailabilityRow day={day} onMore={onOpen} />
              <Box component="span" sx={{ ...cardActionSx, borderColor: "#C7C7C7" }}>
                {t("bookAction")}
              </Box>
            </>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

const CardSkeleton: React.FC = () => (
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "row", lg: "column" },
      width: "100%",
      maxWidth: { lg: 230 },
      overflow: "hidden",
      borderRadius: TILE_RADIUS,
      border: `1px solid ${BORDER}`,
    }}
  >
    <Skeleton
      variant="rectangular"
      sx={{ width: { xs: 129, lg: "100%" }, height: { xs: "auto", lg: 209 }, flexShrink: 0 }}
    />
    {/* Те же резервы высоты, что в карточке, — иначе список «прыгает» после
        загрузки. */}
    <Stack sx={{ flexGrow: 1, p: 1.25 }}>
      <Skeleton width="80%" sx={{ minHeight: NAME_MIN_H }} />
      <Skeleton width="55%" sx={{ minHeight: SPECIALTY_MIN_H }} />
      <Box sx={{ mt: "auto" }}>
        <Skeleton width="85%" sx={{ minHeight: SLOTS_MIN_H, my: 1 }} />
        <Skeleton variant="rounded" height={30} sx={{ borderRadius: 999 }} />
      </Box>
    </Stack>
  </Box>
);

// ── Страница ─────────────────────────────────────────────────────────────────

const DoctorsPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const { orgSlug, go } = useBookingNav();
  const [searchParams, setSearchParams] = useSearchParams();
  const { specialties } = useSpecialties();
  /** Телефон клиники — на него уводим врачей без свободных окон. */
  const { branches } = useBookingOrg();
  const clinicPhone = primaryPhone(branches);

  // Специализация живёт в адресе: экран выбора специализации переходит сюда
  // ссылкой, и та же ссылка должна открываться из мессенджера с тем же фильтром.
  const activeSpecialty = searchParams.get("specialty");
  const setActiveSpecialty = (key: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (key) next.set("specialty", key);
    else next.delete("specialty");
    setSearchParams(next, { replace: true });
  };

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [doctors, setDoctors] = React.useState<ProfessionalPreview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Специализации из адреса может не оказаться в справочнике (старая ссылка) —
  // тогда снимаем фильтр, иначе список пуст без видимой причины.
  React.useEffect(() => {
    if (!activeSpecialty || !specialties.length) return;
    if (!specialties.some((s) => s.key === activeSpecialty)) setActiveSpecialty(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialties, activeSpecialty]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const specialistIds = specialties.find((s) => s.key === activeSpecialty)?.ids;
    getProfessionals(
      {
        organizationSlug: orgSlug,
        specialistIds: specialistIds?.length ? specialistIds : undefined,
        search: debouncedSearch || undefined,
        limit: 100,
      },
      controller.signal,
    )
      .then((res) => setDoctors(res.items))
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // specialties в зависимостях: id специализации известны только после
    // загрузки справочника, и запрос должен уйти с актуальными.
  }, [activeSpecialty, debouncedSearch, specialties, orgSlug]);

  const hasFilters = Boolean(activeSpecialty || debouncedSearch);
  const cardsGrid = {
    display: "grid",
    gap: 2,
    gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(auto-fill, minmax(200px, 230px))" },
  } as const;

  return (
    <PublicBookingShell heading={t("headingDoctorsShort")} backTo="/book">
      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "start",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "269px minmax(0, 1fr)" },
        }}
      >
        {/* Поиск и специализации */}
        <Stack spacing={1.5} sx={{ position: { md: "sticky" }, top: { md: 16 } }}>
          <TextField
            size="small"
            fullWidth
            placeholder={t("searchShort")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <SearchOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
                </InputAdornment>
              ),
              sx: { borderRadius: TILE_RADIUS, bgcolor: "background.paper" },
            }}
          />

          {specialties.length > 0 && (
            <Stack spacing={1} sx={{ display: { xs: "none", md: "flex" } }}>
              {/* Повторный клик по выбранной специализации снимает фильтр —
                  отдельного пункта «Все» в эталоне нет. */}
              {specialties.map((s: SpecialtyGroup) => (
                <SpecialtyTile
                  key={s.key}
                  group={s}
                  active={activeSpecialty === s.key}
                  onClick={() => setActiveSpecialty(activeSpecialty === s.key ? null : s.key)}
                />
              ))}
            </Stack>
          )}
        </Stack>

        {/* Врачи */}
        <Box>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={cardsGrid}>
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </Box>
          ) : doctors.length === 0 ? (
            <Stack alignItems="center" sx={{ py: 8, textAlign: "center" }}>
              <PersonSearchOutlined sx={{ fontSize: 48, color: "text.disabled" }} />
              <Typography fontWeight={600} sx={{ mt: 1.5 }}>
                {t("noSpecialistsFound")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("noSpecialistsFoundHint")}
              </Typography>
              {hasFilters && (
                <Button
                  size="small"
                  onClick={() => {
                    setActiveSpecialty(null);
                    setSearch("");
                  }}
                  sx={{ mt: 1.5 }}
                >
                  {t("resetFilters")}
                </Button>
              )}
            </Stack>
          ) : (
            <Box sx={cardsGrid}>
              {doctors.map((d) => (
                <DoctorCardItem
                  key={d.id}
                  doctor={d}
                  clinicPhone={clinicPhone}
                  onOpen={() => go(`/book/doctor/${idOrSlugRef(d)}`)}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </PublicBookingShell>
  );
};

export default DoctorsPage;
