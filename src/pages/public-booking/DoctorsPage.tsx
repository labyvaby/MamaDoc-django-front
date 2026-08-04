import React from "react";
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import { useNavigate, useSearchParams } from "react-router";

import {
  BOOKING_ORG_SLUG,
  getBranchProfessionals,
  getProfessionalCalendar,
  getProfessionals,
  type CalendarDay,
  type ProfessionalPreview,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
import { PublicBookingShell } from "./shell";
import { useBookingOrg } from "./useBookingOrg";
import { useSpecialties, type SpecialtyGroup } from "./useSpecialties";
import { specialtyIconUrl } from "./specialtyIcons";
import { formatDayMonth, isoInDays, todayIso } from "./format";
import {
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  CARD_BORDER,
  MORE_CHIP_BG,
  PILL_RADIUS,
  nearestTone,
  neutralTone,
} from "./theme";
import { useT } from "../../i18n/VerticalProvider";

/** Сколько окон показываем в карточке до счётчика «+N». */
const SLOTS_PREVIEW = 3;

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
 * такого поля нет, нужен тикет (см. docs/backend-public-booking-guest.md).
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
        .then((days) => {
          const first = days.find((d) => d.isAvailable && d.times.length > 0) ?? null;
          setDay(first);
        })
        .catch((e) => {
          // Календарь — дополнение к карточке: молча прячем строку окон, чтобы
          // ошибка одного врача не ломала весь список.
          if (!isAbortError(e)) setDay(null);
        });
    };

    // IntersectionObserver может быть недоступен (старые вебвью) — тогда просто
    // грузим сразу, это хуже по трафику, но карточка не останется пустой.
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

/** Строка «Свободные окна сегодня: 12:00 8:00 22:00 +3». */
const NearestSlots: React.FC<{ day: CalendarDay | null | undefined; onMore: () => void }> = ({
  day,
  onMore,
}) => {
  const { t } = useT("publicBooking");

  if (day === undefined) {
    return <Skeleton width="85%" height={18} />;
  }
  if (!day) {
    return (
      <Typography sx={{ fontSize: 10, fontWeight: 500, color: "text.secondary" }}>
        {t("freeSlotsNone")}
      </Typography>
    );
  }

  const today = todayIso();
  const tomorrow = isoInDays(1);
  const tone =
    day.date === today
      ? nearestTone.today
      : day.date === tomorrow
        ? nearestTone.tomorrow
        : nearestTone.later;
  const label =
    day.date === today
      ? t("freeSlotsToday")
      : day.date === tomorrow
        ? t("freeSlotsTomorrow")
        : t("freeSlotsOn", { date: formatDayMonth(day.date) });

  const shown = day.times.slice(0, SLOTS_PREVIEW);
  const rest = day.times.length - shown.length;

  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
      <Typography
        noWrap
        sx={{ fontSize: 10, fontWeight: 500, color: tone.label, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Stack direction="row" spacing={0.25} sx={{ minWidth: 0, overflow: "hidden" }}>
        {shown.map((time) => (
          <Box
            key={time}
            sx={{
              px: 0.75,
              borderRadius: PILL_RADIUS,
              bgcolor: tone.chipBg,
              color: tone.chipText,
              fontSize: 10,
              fontWeight: 500,
              lineHeight: "15px",
              whiteSpace: "nowrap",
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
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
            px: 0.5,
            border: 0,
            cursor: "pointer",
            borderRadius: PILL_RADIUS,
            bgcolor: MORE_CHIP_BG,
            color: "#FFFFFF",
            fontFamily: "inherit",
            fontSize: 10,
            fontWeight: 500,
            lineHeight: "15px",
          }}
        >
          +{rest}
          <ChevronRightOutlined sx={{ fontSize: 12 }} />
        </Box>
      )}
    </Stack>
  );
};

// ── Карточка врача ───────────────────────────────────────────────────────────

/** Фото врача; без фото — инициал на приглушённой заливке. */
const DoctorPhoto: React.FC<{ doctor: ProfessionalPreview }> = ({ doctor }) => {
  const [broken, setBroken] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !broken;

  return (
    <Box
      sx={{
        position: "relative",
        flexShrink: 0,
        width: { xs: 130, sm: "100%" },
        height: { xs: "auto", sm: 209 },
        minHeight: { xs: 150, sm: 0 },
        // Нейтраль, а не фирменный синий: иначе врачи без фото — самые яркие
        // в сетке, хотя показать нужно как раз тех, у кого фото есть.
        bgcolor: (t) => neutralTone(t).bg,
        overflow: "hidden",
      }}
    >
      {showPhoto ? (
        <Box
          component="img"
          className="doctor-photo"
          src={doctor.photoUrl ?? undefined}
          alt={doctor.fullName}
          loading="lazy"
          onError={() => setBroken(true)}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            transition: "transform .35s ease",
          }}
        />
      ) : (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{ width: "100%", height: "100%", color: (t) => neutralTone(t).fg }}
        >
          <Typography sx={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>
            {doctor.fullName.charAt(0).toUpperCase()}
          </Typography>
        </Stack>
      )}

      {/* Специализация — плашкой в нижнем углу фото (так в макете). На мобильном
          она уходит под имя: поверх узкого фото подпись не помещается. */}
      {doctor.specialty && (
        <Box
          sx={{
            display: { xs: "none", sm: "block" },
            position: "absolute",
            right: 0,
            bottom: 0,
            px: 1,
            py: 0.75,
            bgcolor: "background.paper",
            borderTopLeftRadius: BOOKING_RADIUS,
            fontSize: 10,
            fontWeight: 600,
            color: "text.secondary",
            maxWidth: "88%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doctor.specialty}
        </Box>
      )}
    </Box>
  );
};

const DoctorCard: React.FC<{
  doctor: ProfessionalPreview;
  index: number;
  onOpen: () => void;
}> = ({ doctor, index, onOpen }) => {
  const { t } = useT("publicBooking");
  const { ref, day } = useNearestDay(doctor.slug || doctor.id);

  return (
    <Paper
      ref={ref}
      elevation={0}
      onClick={onOpen}
      sx={{
        display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        height: "100%",
        overflow: "hidden",
        border: 1,
        borderColor: CARD_BORDER,
        borderRadius: BOOKING_RADIUS,
        cursor: "pointer",
        transition: "border-color .2s, box-shadow .2s",
        animation: "bookingFadeUp .32s ease both",
        animationDelay: `${Math.min(index, 10) * 30}ms`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        "&:hover": { borderColor: "primary.main", boxShadow: BOOKING_SHADOW },
        "&:hover .doctor-photo": { transform: "scale(1.04)" },
      }}
    >
      <DoctorPhoto doctor={doctor} />

      <Stack
        sx={{
          flexGrow: 1,
          minWidth: 0,
          justifyContent: "space-between",
          px: 1.25,
          pt: 1,
          pb: 2,
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: { sm: 38 },
            }}
          >
            {doctor.fullName}
          </Typography>
          {/* На мобильном плашка с фото скрыта — специализация идёт строкой. */}
          {doctor.specialty && (
            <Typography
              noWrap
              sx={{
                display: { xs: "block", sm: "none" },
                mt: 0.25,
                fontSize: 12,
                color: "text.secondary",
              }}
            >
              {doctor.specialty}
            </Typography>
          )}
        </Box>

        <Stack spacing={1} sx={{ minWidth: 0 }}>
          <NearestSlots day={day} onMore={onOpen} />
          <Box
            component="span"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              py: 0.75,
              border: 1,
              borderColor: "#C7C7C7",
              borderRadius: PILL_RADIUS,
              fontSize: 12,
              color: "text.primary",
              transition: "background-color .2s, border-color .2s, color .2s",
              ".MuiPaper-root:hover &": {
                borderColor: "primary.main",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              },
            }}
          >
            {t("bookAction")}
          </Box>
        </Stack>
      </Stack>
    </Paper>
  );
};

const DoctorCardSkeleton: React.FC = () => (
  <Paper
    elevation={0}
    sx={{
      display: "flex",
      flexDirection: { xs: "row", sm: "column" },
      height: "100%",
      overflow: "hidden",
      border: 1,
      borderColor: CARD_BORDER,
      borderRadius: BOOKING_RADIUS,
    }}
  >
    <Skeleton
      variant="rectangular"
      sx={{ width: { xs: 130, sm: "100%" }, height: { xs: 150, sm: 209 }, flexShrink: 0 }}
    />
    <Stack sx={{ px: 1.25, pt: 1, pb: 2, flexGrow: 1, gap: 1 }}>
      <Skeleton width="80%" height={18} />
      <Skeleton width="60%" height={14} />
      <Skeleton variant="rounded" height={28} sx={{ mt: "auto", borderRadius: PILL_RADIUS }} />
    </Stack>
  </Paper>
);

// ── Панель специализаций ─────────────────────────────────────────────────────

const SpecialtyRow: React.FC<{
  title: string;
  icon?: string | null;
  active: boolean;
  onClick: () => void;
}> = ({ title, icon, active, onClick }) => (
  <Box
    component="button"
    type="button"
    onClick={onClick}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      width: "100%",
      px: 1.5,
      py: 1,
      border: 1,
      borderColor: active ? "primary.main" : CARD_BORDER,
      borderRadius: BOOKING_RADIUS,
      bgcolor: active ? (t) => alpha(t.palette.primary.main, 0.06) : "background.paper",
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "border-color .15s, background-color .15s",
      "&:hover": { borderColor: "primary.main" },
    }}
  >
    {icon !== undefined && (
      <Box
        sx={{
          width: 32,
          height: 32,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: (t) => neutralTone(t).fg,
        }}
      >
        {icon ? (
          <Box
            component="img"
            src={icon}
            alt=""
            loading="lazy"
            sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : (
          <MedicalServicesOutlined sx={{ fontSize: 24 }} />
        )}
      </Box>
    )}
    <Typography
      noWrap
      sx={{ fontSize: 14, fontWeight: active ? 600 : 400, color: "text.primary", minWidth: 0 }}
    >
      {title}
    </Typography>
  </Box>
);

// ── Страница ─────────────────────────────────────────────────────────────────

const DoctorsPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { branches } = useBookingOrg();

  const [activeBranch, setActiveBranch] = React.useState<string>("");
  const { specialties } = useSpecialties(activeBranch);

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

  // Выбранной специализации может не быть в новом филиале — иначе список врачей
  // остался бы пустым без видимой причины.
  React.useEffect(() => {
    if (!activeSpecialty || !specialties.length) return;
    if (!specialties.some((s) => s.key === activeSpecialty)) setActiveSpecialty(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialties, activeSpecialty]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Список врачей — при смене фильтров. Скоуп по организации (BOOKING_ORG_SLUG);
  // фильтр филиала — пересечением с врачами филиала (в списочном эндпоинте
  // branch-фильтра нет, а professional preview не содержит филиала).
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const specialistIds = specialties.find((s) => s.key === activeSpecialty)?.ids;
    const base = getProfessionals(
      {
        organizationSlug: BOOKING_ORG_SLUG,
        specialistIds: specialistIds?.length ? specialistIds : undefined,
        search: debouncedSearch || undefined,
        limit: 100,
      },
      controller.signal,
    );
    const branch = activeBranch
      ? getBranchProfessionals(activeBranch, { limit: 100 }, controller.signal)
      : null;
    Promise.all([base, branch])
      .then(([baseRes, branchRes]) => {
        if (!branchRes) {
          setDoctors(baseRes.items);
          return;
        }
        const branchIds = new Set(branchRes.items.map((d) => d.id));
        setDoctors(baseRes.items.filter((d) => branchIds.has(d.id)));
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // specialties в зависимостях: при смене филиала id одной и той же
    // специализации меняются, и запрос должен уйти с актуальными.
  }, [activeSpecialty, debouncedSearch, activeBranch, specialties]);

  const hasFilters = Boolean(activeSpecialty || activeBranch || debouncedSearch);
  const resetFilters = () => {
    setActiveSpecialty(null);
    setActiveBranch("");
    setSearch("");
  };

  const searchField = (
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
        sx: { borderRadius: BOOKING_RADIUS },
      }}
    />
  );

  return (
    <PublicBookingShell
      heading={
        <>
          <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
            {t("headingDoctors")}
          </Box>
          <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>
            {t("headingDoctorsShort")}
          </Box>
        </>
      }
      backTo="/book"
    >
      <Box
        sx={{
          display: "grid",
          gap: { xs: 1.5, lg: 3.75 },
          alignItems: "start",
          // minmax(0, 1fr), а не 1fr: минимальный размер колонки — min-content,
          // и длинные названия врачей раздували бы её на всю свою ширину.
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "269px minmax(0, 1fr)" },
        }}
      >
        {/* Фильтры: поиск виден всегда, список специализаций — только на
            десктопе. На мобильном специализацию выбирают на отдельном экране
            (/book), дублировать её лентой чипов незачем. */}
        <Stack spacing={1.5} sx={{ position: { lg: "sticky" }, top: { lg: 76 } }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 0, lg: 2 },
              border: { xs: "none", lg: 1 },
              borderColor: { lg: CARD_BORDER },
              borderRadius: BOOKING_RADIUS,
              bgcolor: { xs: "transparent", lg: "background.paper" },
            }}
          >
            <Stack spacing={1.5}>
              {searchField}

              {branches.length > 1 && (
                <Select
                  size="small"
                  displayEmpty
                  fullWidth
                  value={activeBranch}
                  onChange={(e) => setActiveBranch(e.target.value)}
                  sx={{ borderRadius: BOOKING_RADIUS }}
                >
                  <MenuItem value="">{t("allBranches")}</MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={b.slug || String(b.id)}>
                      {b.name}
                    </MenuItem>
                  ))}
                </Select>
              )}

              {specialties.length > 0 && (
                <Box sx={{ display: { xs: "none", lg: "block" } }}>
                  <Box sx={{ maxHeight: 520, overflowY: "auto", pr: 0.5 }}>
                    <Stack spacing={1.25}>
                      <SpecialtyRow
                        title={t("allSpecialties")}
                        active={!activeSpecialty}
                        onClick={() => setActiveSpecialty(null)}
                      />
                      {specialties.map((s: SpecialtyGroup) => (
                        <SpecialtyRow
                          key={s.key}
                          title={s.title}
                          icon={specialtyIconUrl(s.title)}
                          active={activeSpecialty === s.key}
                          onClick={() => setActiveSpecialty(s.key)}
                        />
                      ))}
                    </Stack>
                  </Box>
                </Box>
              )}
            </Stack>
          </Paper>
        </Stack>

        {/* Врачи */}
        <Box>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box
              sx={{
                display: "grid",
                gap: 2.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(3, minmax(0, 1fr))",
                  lg: "repeat(4, minmax(0, 1fr))",
                },
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <DoctorCardSkeleton key={i} />
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
                <Button size="small" onClick={resetFilters} sx={{ mt: 1.5 }}>
                  {t("resetFilters")}
                </Button>
              )}
            </Stack>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(3, minmax(0, 1fr))",
                  lg: "repeat(4, minmax(0, 1fr))",
                },
              }}
            >
              {doctors.map((d, index) => (
                <DoctorCard
                  key={d.id}
                  doctor={d}
                  index={index}
                  onOpen={() => navigate(`/book/doctor/${d.slug || d.id}`)}
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
