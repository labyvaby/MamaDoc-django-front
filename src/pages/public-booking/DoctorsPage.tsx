import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { useNavigate } from "react-router";

import {
  BOOKING_ORG_SLUG,
  getBranchProfessionals,
  getBranchSpecialists,
  getProfessionals,
  type ProfessionalPreview,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
import { PublicBookingShell } from "./shell";
import { useBookingOrg } from "./useBookingOrg";
import { BOOKING_RADIUS, TILE_RADIUS, hoverLift, neutralTone } from "./theme";
import { useT } from "../../i18n/VerticalProvider";

// ── Карточка врача ────────────────────────────────────────────────────────────

/** Фото врача во всю ширину блока; без фото — инициал на приглушённой заливке. */
const DoctorPhoto: React.FC<{ doctor: ProfessionalPreview }> = ({ doctor }) => {
  const [broken, setBroken] = React.useState(false);
  const showPhoto = Boolean(doctor.photoUrl) && !broken;

  return (
    <Box
      sx={{
        flexShrink: 0,
        width: { xs: 116, sm: "100%" },
        height: { xs: "auto", sm: 196 },
        minHeight: { xs: 132, sm: 0 },
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
    </Box>
  );
};

/**
 * Карточка врача в сетке. Имя занимает фиксированные две строки, а стаж —
 * ещё одну: иначе кнопки в соседних карточках стоят на разной высоте.
 * Специализация — в тексте карточки, а не поверх фото (там подпись наезжала
 * на границу и обрезалась).
 */
const DoctorCard: React.FC<{
  doctor: ProfessionalPreview;
  index: number;
  onClick: () => void;
}> = ({ doctor, index, onClick }) => {
  const { t } = useT("publicBooking");

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={(theme) => ({
        display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        height: "100%",
        overflow: "hidden",
        borderRadius: TILE_RADIUS,
        cursor: "pointer",
        transition: "border-color .2s, transform .2s, box-shadow .2s",
        // Карточки появляются волной — по 30 мс на позицию, но не дольше 300 мс,
        // иначе последние в длинной сетке приезжают заметно позже остальных.
        animation: "bookingFadeUp .32s ease both",
        animationDelay: `${Math.min(index, 10) * 30}ms`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        "&:hover": hoverLift(theme),
        "&:hover .doctor-photo": { transform: "scale(1.04)" },
        "&:active": { transform: "scale(0.985)" },
      })}
    >
      <DoctorPhoto doctor={doctor} />
      <Stack sx={{ p: 1.5, flexGrow: 1, minWidth: 0, gap: 0.25 }}>
        <Typography
          fontWeight={600}
          fontSize={14}
          lineHeight={1.35}
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: { sm: 38 },
          }}
        >
          {doctor.fullName}
        </Typography>
        {/* Специализация и стаж занимают место даже когда пусты: у врача без
            них кнопка иначе поднимается выше, чем у соседей по сетке.
            Специализация — нейтральным цветом: синим она спорила с кнопкой
            «Записаться», хотя это справка, а не действие. */}
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          noWrap
          sx={{ minHeight: { sm: 18 } }}
        >
          {doctor.specialty}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ minHeight: { sm: 18 } }}>
          {doctor.experienceYears > 0
            ? t("experienceYears", { count: doctor.experienceYears })
            : ""}
        </Typography>
        <Button
          variant="contained"
          size="small"
          disableElevation
          sx={{
            mt: 1,
            alignSelf: "stretch",
            borderRadius: 99,
            fontSize: 12,
            fontWeight: 600,
            py: 0.5,
          }}
        >
          {t("bookAction")}
        </Button>
      </Stack>
    </Paper>
  );
};

const DoctorCardSkeleton: React.FC = () => (
  <Paper
    variant="outlined"
    sx={{
      display: "flex",
      flexDirection: { xs: "row", sm: "column" },
      height: "100%",
      overflow: "hidden",
      borderRadius: TILE_RADIUS,
    }}
  >
    <Skeleton
      variant="rectangular"
      sx={{ width: { xs: 116, sm: "100%" }, height: { xs: 132, sm: 196 }, flexShrink: 0 }}
    />
    <Stack sx={{ p: 1.5, flexGrow: 1, gap: 0.5 }}>
      <Skeleton width="80%" height={18} />
      <Skeleton width="50%" height={14} />
      <Skeleton variant="rounded" height={28} sx={{ mt: "auto", borderRadius: 99 }} />
    </Stack>
  </Paper>
);

// ── Пункт специализации (десктопная колонка фильтров) ─────────────────────────

/**
 * Строка списка специализаций. Раньше это была плитка с буквенным аватаром и
 * шевроном — шеврон ничего не раскрывал, а аватары превращали фильтр в стену
 * цветных квадратов. Здесь выбор показывает только заливка.
 */
const SpecialtyItem: React.FC<{
  title: string;
  active: boolean;
  onClick: () => void;
}> = ({ title, active, onClick }) => (
  <Box
    component="button"
    type="button"
    onClick={onClick}
    sx={{
      display: "block",
      width: "100%",
      px: 1.25,
      py: 1,
      border: 0,
      textAlign: "left",
      cursor: "pointer",
      borderRadius: "8px",
      fontFamily: "inherit",
      fontSize: 14,
      lineHeight: 1.4,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      transition: "background-color .15s, color .15s",
      ...(active
        ? {
            fontWeight: 600,
            color: (t) => t.palette.primary.onSurface,
            bgcolor: (t) => t.palette.primary.lighter,
          }
        : {
            fontWeight: 400,
            color: (t) => t.palette.text.primary,
            bgcolor: "transparent",
            "&:hover": { bgcolor: (t) => alpha(t.palette.text.primary, 0.05) },
          }),
    }}
  >
    {title}
  </Box>
);

// ── Страница ──────────────────────────────────────────────────────────────────

/**
 * Специализация в фильтре. Одно и то же название приходит из разных филиалов
 * со своими id («Дерматолог» есть и в «Мама Доктор», и в «Плюс»), поэтому
 * группируем по названию и фильтруем врачей сразу по всем его id.
 */
interface SpecialtyGroup {
  key: string;
  title: string;
  ids: number[];
}

const DoctorsPage: React.FC = () => {
  const { t } = useT("publicBooking");
  const navigate = useNavigate();
  const { organization, branches } = useBookingOrg();

  const [specialists, setSpecialists] = React.useState<SpecialtyGroup[]>([]);
  const [activeSpecialist, setActiveSpecialist] = React.useState<string | null>(null);
  const [activeBranch, setActiveBranch] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const [doctors, setDoctors] = React.useState<ProfessionalPreview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Специализации фильтра — только те, что есть в филиалах этой клиники.
  // Общий справочник `/specialists/` не скоупится по организации: он отдаёт все
  // 22 записи обеих организаций, и в фильтре висели Проктолог, Флеболог, УЗИст,
  // к которым записаться нельзя — врачей с ними нет. При выбранном филиале
  // список сужается до его специализаций.
  React.useEffect(() => {
    if (!branches.length) return;
    const controller = new AbortController();
    const targets = activeBranch
      ? branches.filter((b) => (b.slug || String(b.id)) === activeBranch)
      : branches;

    Promise.all(
      targets.map((b) =>
        getBranchSpecialists(b.slug || b.id, controller.signal)
          .then((r) => r.items)
          .catch((e) => {
            if (isAbortError(e)) throw e;
            return [];
          }),
      ),
    )
      .then((lists) => {
        const groups = new Map<string, SpecialtyGroup>();
        for (const item of lists.flat()) {
          const title = item.title.trim();
          const key = title.toLowerCase();
          if (!key) continue;
          const group = groups.get(key);
          if (group) {
            if (!group.ids.includes(item.id)) group.ids.push(item.id);
          } else {
            groups.set(key, { key, title, ids: [item.id] });
          }
        }
        const next = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"));
        setSpecialists(next);
        // Выбранной специализации может не быть в новом филиале — иначе список
        // врачей остался бы пустым без видимой причины.
        setActiveSpecialist((current) =>
          current && !groups.has(current) ? null : current,
        );
      })
      .catch((e) => {
        if (!isAbortError(e)) setSpecialists([]);
      });
    return () => controller.abort();
  }, [branches, activeBranch]);

  // Дебаунс поиска.
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
    const specialistIds = specialists.find((s) => s.key === activeSpecialist)?.ids;
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
    // specialists в зависимостях: при смене филиала id одной и той же
    // специализации меняются, и запрос должен уйти с актуальными.
  }, [activeSpecialist, debouncedSearch, activeBranch, specialists]);

  const hasFilters = Boolean(activeSpecialist || activeBranch || debouncedSearch);
  const resetFilters = () => {
    setActiveSpecialist(null);
    setActiveBranch("");
    setSearch("");
  };

  const filtersPanel = (
    <Stack spacing={1.5}>
      {branches.length > 1 && (
        <Select
          size="small"
          displayEmpty
          fullWidth
          value={activeBranch}
          onChange={(e) => setActiveBranch(e.target.value)}
        >
          <MenuItem value="">{t("allBranches")}</MenuItem>
          {branches.map((b) => (
            <MenuItem key={b.id} value={b.slug || String(b.id)}>
              {b.name}
            </MenuItem>
          ))}
        </Select>
      )}
    </Stack>
  );

  return (
    <PublicBookingShell>
      {/* Первый экран: зачем страница, поиск и чем клиника располагает.
          Поиск здесь, а не в боковой панели — это главное действие. */}
      <Stack alignItems="center" spacing={2} sx={{ py: { xs: 3, md: 5 }, textAlign: "center" }}>
        <Box>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 26, sm: 32, md: 38 },
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {t("heroTitle")}
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 1, mx: "auto", maxWidth: 520, fontSize: { xs: 14, sm: 16 } }}
          >
            {t("heroSubtitle")}
          </Typography>
        </Box>

        <TextField
          size="medium"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: "100%", maxWidth: 460 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {organization && (
          <Stack
            direction="row"
            justifyContent="center"
            flexWrap="wrap"
            sx={{ color: "text.secondary", fontSize: 14, columnGap: 1, rowGap: 0.5 }}
          >
            <span>{t("statDoctors", { count: organization.professionalsCount })}</span>
            <span>·</span>
            <span>{t("statSpecialties", { count: organization.specialistsCount })}</span>
            {branches.length > 1 && (
              <>
                <span>·</span>
                <span>{t("statBranches", { count: branches.length })}</span>
              </>
            )}
          </Stack>
        )}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "start",
          // minmax(0, 1fr), а не 1fr: минимальный размер колонки — min-content,
        // и горизонтальная лента чипов внутри раздувала бы её на всю свою длину.
        gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "280px minmax(0, 1fr)" },
        }}
      >
        {/* Фильтры: на десктопе — колонка-панель, на мобильных — поиск + лента чипов */}
        <Box sx={{ position: { lg: "sticky" }, top: { lg: 88 } }}>
          <Paper
            variant="outlined"
            sx={{ p: { xs: 1.5, lg: 2 }, borderRadius: BOOKING_RADIUS }}
          >
            {filtersPanel}

            {specialists.length > 0 && (
              <Box sx={{ mt: 1.5, display: { xs: "none", lg: "block" } }}>
                {/* «Сбросить» всегда на месте (просто выключается): появляясь и
                    исчезая, она сдвигала список специализаций вниз-вверх. */}
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {t("specialtyFilter")}
                  </Typography>
                  <Button
                    size="small"
                    disabled={!hasFilters}
                    onClick={resetFilters}
                    sx={{ fontSize: 12, minWidth: 0, px: 0.5 }}
                  >
                    {t("reset")}
                  </Button>
                </Stack>
                <Box sx={{ maxHeight: 420, overflowY: "auto", mt: 0.5, pr: 0.5 }}>
                  <Stack spacing={0.25}>
                    <SpecialtyItem
                      title={t("allSpecialties")}
                      active={activeSpecialist === null}
                      onClick={() => setActiveSpecialist(null)}
                    />
                    {specialists.map((s) => (
                      <SpecialtyItem
                        key={s.key}
                        title={s.title}
                        active={activeSpecialist === s.key}
                        onClick={() => setActiveSpecialist(s.key)}
                      />
                    ))}
                  </Stack>
                </Box>
              </Box>
            )}
          </Paper>

          {specialists.length > 0 && (
            <Box
              sx={{
                display: { xs: "flex", lg: "none" },
                gap: 1,
                mt: 1.5,
                overflowX: "auto",
                pb: 0.5,
                // Лента фильтров прокручивается вбок — без скрытия скроллбара
                // она «съедала» бы вторую строку под тонкую полосу.
                "&::-webkit-scrollbar": { display: "none" },
                scrollbarWidth: "none",
              }}
            >
              <Chip
                label={t("allShort")}
                color={activeSpecialist === null ? "primary" : "default"}
                variant={activeSpecialist === null ? "filled" : "outlined"}
                onClick={() => setActiveSpecialist(null)}
                sx={{ flexShrink: 0 }}
              />
              {specialists.map((s) => (
                <Chip
                  key={s.key}
                  label={s.title}
                  color={activeSpecialist === s.key ? "primary" : "default"}
                  variant={activeSpecialist === s.key ? "filled" : "outlined"}
                  onClick={() => setActiveSpecialist(s.key)}
                  sx={{ flexShrink: 0 }}
                />
              ))}
            </Box>
          )}
        </Box>

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
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                  lg: "repeat(4, 1fr)",
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
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
              }}
            >
              {doctors.map((d, index) => (
                <DoctorCard
                  key={d.id}
                  doctor={d}
                  index={index}
                  onClick={() => navigate(`/book/doctor/${d.slug || d.id}`)}
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
