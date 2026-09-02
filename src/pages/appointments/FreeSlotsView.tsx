import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import KeyboardArrowLeftOutlined from "@mui/icons-material/KeyboardArrowLeftOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import { useQueries, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { getSpecializations, type DjangoSpecialization } from "../../api/staff";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import {
  getAvailability,
  getAvailabilitySummary,
  type EmployeeAvailability,
  type AvailabilityDay,
} from "../../api/scheduling";
import { buildTimeline } from "./freeSlotsTimeline";
import {
  getStatusAccent,
  getStatusChipSx,
  getStatusConfig,
  getStatusLabel,
} from "../../config/appointmentStatuses";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { tt } from "../../i18n/t";

// Календарные подписи — данные локали, а не терминология вертикали:
// в клинике и салоне они одинаковы, поэтому в глоссарий не выносятся.
// Полноценно это заменяется данными dayjs (ru) — отдельная задача, т.к.
// в родительном падеже («января») нужна standalone-форма.
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const MONTHS_SHORT = [
  "янв.", "фев.", "мар.", "апр.", "мая", "июн.",
  "июл.", "авг.", "сен.", "окт.", "ноя.", "дек.",
];

/**
 * Лента дат больше не имеет фиксированного горизонта: диапазон собирается из
 * чанков по 30 дней (влезает в лимит бэка 62 на один запрос). По умолчанию
 * грузим один чанк назад и один вперёд (±30 дней от сегодня); когда лента
 * прокручивается к краю, добавляется следующий чанк в эту сторону.
 */
const CHUNK_DAYS = 30;
/** За сколько пикселей до края ленты начинаем догрузку следующего чанка. */
const STRIP_LOAD_THRESHOLD_PX = 260;

/** Индекс дня недели с понедельника (Пн=0 … Вс=6), без плагина isoWeek. */
function mondayIndex(d: Dayjs): number {
  return (d.day() + 6) % 7;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

/**
 * «Аббасова Айгерим Аббасовна» → «Аббасова А. А.»: в мобильном пейджере полное
 * ФИО не влезает между стрелками и обрывается многоточием, а фамилия с
 * инициалами узнаётся с одного взгляда.
 */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const initialsTail = parts.slice(1).map((w) => `${w[0].toUpperCase()}.`).join(" ");
  return `${parts[0]} ${initialsTail}`;
}

/** Ширина зоны стрелки пейджера: под ней текст карточки погашен маской. */
const PAGER_ARROW_ZONE = 34;
/** Зона справа: счётчик «2/7» плюс стрелка «вперёд». */
const PAGER_COUNTER_ZONE = 72;
/** Края трека гасим, чтобы уезжающее имя не сталкивалось со стрелками. */
const PAGER_EDGE_MASK = `linear-gradient(90deg, transparent 0, #000 ${PAGER_ARROW_ZONE}px, #000 calc(100% - ${PAGER_COUNTER_ZONE}px), transparent 100%)`;

/** Стабильный цвет аватара по имени (аналог stringToColor из оригинала). */
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 46%)`;
}

type DocStatus = "free" | "later" | "none";

interface DocSummary {
  todayFree: number;
  nearest: { date: string; start: string } | null;
  status: DocStatus;
  /** Подпись под именем врача. */
  label: string;
  /** true, если у врача нет ни одного рабочего дня в горизонте. */
  noSchedule: boolean;
}

function summarize(emp: EmployeeAvailability, todayIso: string): DocSummary {
  const today = emp.days.find((d) => d.date === todayIso);
  const todayFree = today?.freeCount ?? 0;
  const nearest = emp.nearestFree;
  // «График не задан» — только если в горизонте нет ни рабочего дня, ни
  // выходного/отпуска по исключению (иначе график есть, просто нет окон).
  const noSchedule = !emp.days.some((d) => d.scheduled || d.dayOff);

  if (nearest && nearest.date === todayIso) {
    return {
      todayFree,
      nearest,
      status: "free",
      label: tt("appointments:slots.todayNearest", { time: nearest.start }),
      noSchedule,
    };
  }
  if (nearest) {
    const d = dayjs(nearest.date);
    const isTomorrow = nearest.date === dayjs().add(1, "day").format("YYYY-MM-DD");
    const rel = isTomorrow
      ? tt("appointments:slots.tomorrow")
      : `${WEEKDAY_SHORT[mondayIndex(d)]} ${d.date()}`;
    return {
      todayFree,
      nearest,
      status: "later",
      label: tt("appointments:slots.nearest", { when: rel, time: nearest.start }),
      noSchedule,
    };
  }
  return {
    todayFree,
    nearest: null,
    status: "none",
    label: noSchedule
      ? tt("appointments:slots.noScheduleShort")
      : tt("appointments:slots.noFreeSlotsShort"),
    noSchedule,
  };
}

const STATUS_DOT: Record<DocStatus, "success.main" | "warning.main" | "text.disabled"> = {
  free: "success.main",
  later: "warning.main",
  none: "text.disabled",
};

// ── Список врачей под группой специальностей ─────────────────────────────────

interface DocRailListProps {
  docs: { emp: EmployeeAvailability; sum: DocSummary }[];
  selectedId: number | null;
  /** Окна специальности ещё грузятся — показываем спиннер, а не пустоту. */
  loading: boolean;
  onSelect: (employeeId: number | null) => void;
  onSearch?: (fullName: string) => void;
}

/**
 * Раскрывающийся список врачей группы в левом рельсе. Выбор врача — это фильтр
 * сетки, а не отдельный экран: клик по активному врачу снимает фильтр.
 */
const DocRailList: React.FC<DocRailListProps> = ({ docs, selectedId, loading, onSelect, onSearch }) => {
  const { t } = useT("appointments");

  return (
    <Stack
      spacing={0.25}
      sx={(tokens) => ({ py: 0.5, px: 1, bgcolor: alpha(tokens.palette.primary.main, 0.03) })}
    >
      {loading && docs.length === 0 ? (
        <Stack alignItems="center" sx={{ py: 1 }}>
          <CircularProgress size={16} />
        </Stack>
      ) : docs.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ px: 1.25, py: 0.5 }}>
          {t("slots.specialistsNotFound")}
        </Typography>
      ) : (
        docs.map(({ emp, sum }) => {
          const isDocActive = selectedId === emp.employeeId;
          return (
            <Stack
              key={emp.employeeId}
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={(e) => {
                e.stopPropagation();
                if (onSearch) {
                  onSearch(emp.fullName);
                } else {
                  onSelect(isDocActive ? null : emp.employeeId);
                }
              }}
              sx={(tokens) => ({
                py: 0.75,
                px: 1.25,
                borderRadius: "8px",
                cursor: "pointer",
                bgcolor: isDocActive ? "primary.main" : "transparent",
                color: isDocActive ? "primary.contrastText" : "text.primary",
                transition: "all .13s ease",
                "@media (hover: hover)": {
                  "&:hover": {
                    bgcolor: isDocActive ? "primary.main" : alpha(tokens.palette.primary.main, 0.08),
                  },
                },
              })}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  bgcolor: isDocActive ? "primary.contrastText" : STATUS_DOT[sum.status],
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="caption"
                fontWeight={isDocActive ? 700 : 500}
                noWrap
                sx={{ flex: 1, minWidth: 0, fontSize: "0.775rem" }}
              >
                {emp.fullName}
              </Typography>
            </Stack>
          );
        })
      )}
    </Stack>
  );
};

// ── Таймлайн дня ──────────────────────────────────────────────────────────────

interface DayTimelineProps {
  day: AvailabilityDay;
  employeeId: number;
  /** Компактный режим — колонка в сетке врачей (уже и мельче). */
  dense?: boolean;
  onBook: (employeeId: number, isoDateTime: string) => void;
  /** Клик по занятому времени — открыть карточку приёма поверх окон. */
  onOpenAppointment?: (appointmentId: number) => void;
  /** Клик не считается, если это было перетаскивание сетки (drag-to-scroll). */
  dragMovedRef?: { current: boolean };
  /**
   * «Окон нет — поставить в лист ожидания»: главный тупик регистратора, из
   * которого раньше выхода не было. Не задан — кнопка не показывается (нет
   * права на очередь или модуль выключен).
   */
  onWaitlist?: (employeeId: number, date: string) => void;
}

/** Окна и приёмы одного дня одного врача — общий рендер сетки и панели врача. */
const DayTimeline: React.FC<DayTimelineProps> = ({
  day,
  employeeId,
  dense = false,
  onBook,
  onOpenAppointment,
  dragMovedRef,
  onWaitlist,
}) => {
  const { t } = useT("appointments");
  const { t: tWaitlist } = useT("waitlist");
  const theme = useTheme();
  const rows = React.useMemo(() => buildTimeline(day), [day]);

  /** Кнопка «в лист ожидания» под заглушкой «окон нет». */
  const waitlistAction = onWaitlist ? (
    <Button size="small" onClick={() => onWaitlist(employeeId, day.date)}>
      {tWaitlist("add")}
    </Button>
  ) : undefined;

  // Приём есть, а смены в этот день нет (или это выходной): раньше здесь стояла
  // заглушка «нет графика» и приёмы не показывались вообще — врач выглядел
  // пустой колонкой. Показываем приёмы, но помечаем: окон для записи тут нет.
  const offSchedule = (!day.scheduled || day.dayOff) && rows.some((r) => r.kind === "appt");

  if (day.dayOff && !offSchedule) {
    return (
      <Alert severity="info" icon={false} action={waitlistAction}>
        {t("slots.dayOff")}
      </Alert>
    );
  }
  if (!day.scheduled && !offSchedule) {
    return <Alert severity="info" icon={false}>{t("slots.noSchedule")}</Alert>;
  }
  if (rows.length === 0) {
    return (
      <Alert severity="info" icon={false} action={waitlistAction}>
        {dense ? t("slots.noSlotsShort") : t("slots.noFreeSlots")}
      </Alert>
    );
  }

  const timeFontSize = dense ? "0.775rem" : "0.8rem";

  return (
    <Stack spacing={0.5}>
      {offSchedule && (
        <Alert
          severity="warning"
          icon={false}
          sx={{
            py: 0,
            px: 1,
            borderRadius: "8px",
            "& .MuiAlert-message": {
              py: 0.5,
              fontSize: dense ? "0.6875rem" : "0.75rem",
              lineHeight: 1.35,
            },
          }}
        >
          {t("slots.offScheduleAppointments")}
        </Alert>
      )}
      {rows.map((row) => {
        if (row.kind === "appt") {
          const { appt } = row;
          const accent = getStatusAccent(appt.status, theme);
          const statusLabel = getStatusLabel(appt.status);
          const patient = appt.patientName || t("slots.busy");
          return (
            <Tooltip
              key={row.key}
              title={`${appt.start}–${appt.end} · ${patient} · ${statusLabel}`}
              placement="top"
              disableInteractive
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={dense ? 0.75 : 1}
                onClick={
                  onOpenAppointment
                    ? () => {
                        if (dragMovedRef?.current) return;
                        onOpenAppointment(appt.id);
                      }
                    : undefined
                }
                sx={{
                  px: dense ? 1 : 1.25,
                  py: dense ? 0.5 : 0.75,
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: "divider",
                  borderLeft: `3px solid ${accent.main}`,
                  bgcolor: subtleBg(theme),
                  cursor: onOpenAppointment ? "pointer" : "default",
                  transition: "background-color .13s ease",
                  "@media (hover: hover)": {
                    "&:hover": onOpenAppointment
                      ? { bgcolor: alpha(accent.main, theme.palette.mode === "dark" ? 0.16 : 0.09) }
                      : {},
                  },
                  "&:active": onOpenAppointment
                    ? { bgcolor: alpha(accent.main, theme.palette.mode === "dark" ? 0.22 : 0.13) }
                    : {},
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    fontSize: timeFontSize,
                    flexShrink: 0,
                    color: "text.primary",
                  }}
                >
                  {dense ? appt.start : `${appt.start}–${appt.end}`}
                </Typography>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ flex: 1, minWidth: 0, fontSize: dense ? "0.7rem" : "0.75rem" }}
                >
                  {patient}
                </Typography>
                {dense ? (
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      bgcolor: accent.main,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <Chip
                    size="small"
                    icon={getStatusConfig(appt.status).icon}
                    label={statusLabel}
                    sx={getStatusChipSx(appt.status)}
                  />
                )}
              </Stack>
            </Tooltip>
          );
        }

        const { slot } = row;
        // Не свободен и не занят приёмом — окно, которое уже прошло.
        const past = !slot.free && slot.appointmentId == null;
        const busy = !slot.free && slot.appointmentId != null;
        return (
          <Stack
            key={row.key}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={dense ? 0.75 : 1}
            onClick={
              slot.free
                ? () => {
                    if (dragMovedRef?.current) return;
                    onBook(employeeId, `${day.date}T${slot.start}`);
                  }
                : busy && onOpenAppointment
                  ? () => {
                      if (dragMovedRef?.current) return;
                      onOpenAppointment(slot.appointmentId!);
                    }
                  : undefined
            }
            sx={{
              width: "100%",
              px: dense ? 1 : 1.25,
              py: dense ? 0.5 : 0.75,
              borderRadius: dense ? "7px" : "8px",
              border: "1px solid",
              borderStyle: past ? "dashed" : "solid",
              borderColor: slot.free ? alpha(theme.palette.success.main, 0.32) : "divider",
              bgcolor: slot.free
                ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.14 : 0.08)
                : busy
                  ? subtleBg(theme)
                  : "transparent",
              cursor: slot.free || busy ? "pointer" : "default",
              transition: "filter .13s ease",
              "@media (hover: hover)": {
                "&:hover": slot.free ? { filter: "brightness(1.04)" } : {},
              },
              "&:active": slot.free || busy ? { filter: "brightness(1.09)" } : {},
            }}
          >
            <Typography
              sx={{
                fontFamily: "monospace",
                fontWeight: 600,
                fontSize: timeFontSize,
                ...(dense ? {} : { width: 44 }),
                flexShrink: 0,
                color: slot.free ? "success.main" : "text.disabled",
              }}
            >
              {slot.start}
            </Typography>
            {slot.free ? (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="center"
                spacing={0.4}
                sx={(tokens) => ({
                  ml: "auto",
                  px: 0.85,
                  height: 22,
                  borderRadius: "5px",
                  border: "1px solid",
                  borderColor: alpha(tokens.palette.success.main, 0.32),
                  color: "success.dark",
                  fontWeight: 600,
                  fontSize: "0.6875rem",
                  lineHeight: 1,
                  flexShrink: 0,
                  ...(tokens.palette.mode === "dark" ? { color: tokens.palette.success.light } : {}),
                })}
              >
                <AddOutlined sx={{ fontSize: 13, flexShrink: 0 }} />
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    lineHeight: 1,
                    display: "inline-block",
                  }}
                >
                  {t("slots.book")}
                </Typography>
              </Stack>
            ) : busy ? (
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: "right" }} noWrap>
                {slot.patientName ?? ""}
              </Typography>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
};

export interface FreeSlotsViewProps {
  branchId?: number;
  organizationId?: number;
  headerActions?: React.ReactNode;
  /** Открыть создание приёма с предзаполнением врача и времени (услуга — в форме). */
  onBook: (employeeId: number, isoDateTime: string) => void;
  /** Клик по занятому времени — открыть карточку этого приёма поверх окон. */
  onOpenAppointment?: (appointmentId: number) => void;
  /** «Окон нет — поставить в лист ожидания» (см. DayTimelineProps.onWaitlist). */
  onWaitlist?: (employeeId: number, date: string) => void;
}

const FreeSlotsView: React.FC<FreeSlotsViewProps> = ({
  branchId,
  organizationId,
  headerActions,
  onBook,
  onOpenAppointment,
  onWaitlist,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  const todayIso = React.useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  // Сколько 30-дневных чанков загружено в прошлое и в будущее от сегодня.
  // Чанки привязаны к «сегодня» (стабильные границы), поэтому расширение
  // диапазона не инвалидирует уже закэшированные куски.
  const [pastChunks, setPastChunks] = React.useState(1);
  const [futureChunks, setFutureChunks] = React.useState(1);

  const [specId, setSpecId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState("");
  // На телефоне поиск врача не висит в шапке постоянно (это 45px из ~380px,
  // которые съедала обвязка), а разворачивается по тапу на лупу.
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  // Drag-to-scroll мышью нужен только там, где есть мышь: на тач-экране он
  // конкурирует с нативным свайпом и даёт «залипания».
  const isFinePointer = useMediaQuery("(pointer: fine)");
  const [selDocId, setSelDocId] = React.useState<number | null>(null);
  const [selDay, setSelDay] = React.useState<string | null>(null);
  const searchByDoctor = React.useCallback((fullName: string) => {
    setSearch(fullName);
    // Поиск — единственный способ сузить врача в режиме окон. Не оставляем
    // параллельно старый rail-фильтр, чтобы очистка строки возвращала всех.
    setSelDocId(null);
  }, []);
  // Позволяет свернуть раскрытый список врачей под активной специальностью.
  // При первом открытии остаёмся на «Все специалисты», но список врачей свёрнут.
  const [collapsedGroup, setCollapsedGroup] = React.useState<number | "all" | null>("all");
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [isStripDragging, setIsStripDragging] = React.useState(false);
  const stripDragStartXRef = React.useRef(0);
  const stripScrollStartRef = React.useRef(0);
  const stripDragMovedRef = React.useRef(false);
  /** Пользователь сам ткнул в дату — автовыбор больше не вмешивается. */
  const userPickedDayRef = React.useRef(false);

  // Перетаскивание мышкой для горизонтального скролла сетки врачей (drag-to-scroll)
  const matrixScrollRef = React.useRef<HTMLDivElement>(null);
  // Запоминаем не индекс, а id врача: состав колонок меняется при выборе
  // другой даты, поэтому индекс на новой дате уже может указывать на другого
  // человека.
  const activeEmployeeIdsRef = React.useRef<number[]>([]);
  const focusedEmployeeIdRef = React.useRef<number | null>(null);
  const matrixScrollLeftRef = React.useRef(0);
  const focusContextRef = React.useRef<{ specId: number | null; search: string }>({
    specId: null,
    search: "",
  });
  // Какая колонка врача сейчас перед глазами: на телефоне колонка занимает всю
  // ширину, поэтому индекс = позиция скролла / ширина контейнера. Нужен для
  // подсветки активного аватара в мобильной полосе врачей.
  const [activeDocIdx, setActiveDocIdx] = React.useState(0);
  const [docMenuAnchor, setDocMenuAnchor] = React.useState<HTMLElement | null>(null);
  // Карточка врача в мобильной шапке — такая же карусель, как колонки под ней:
  // трек сдвигаем на тот же дробный прогресс скролла, поэтому имя едет вместе с
  // расписанием (и при свайпе пальцем, и при тапе по стрелкам), а не
  // перескакивает по окончании слайда.
  const pagerTrackRef = React.useRef<HTMLDivElement>(null);
  const pagerRafRef = React.useRef<number | null>(null);
  const pagerLastLeftRef = React.useRef(-1);
  const pagerStillFramesRef = React.useRef(0);

  /**
   * Ставит трек шапки в ту же точку, где стоит сетка. Прогресс дробный, ширина
   * трека равна ширине колонки, поэтому сдвиг совпадает с сеткой один в один.
   * Пишем прямо в style: ререндер шапки на каждый кадр прокрутки дороже самой
   * анимации.
   */
  const syncPagerToScroll = React.useCallback(() => {
    const el = matrixScrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const left = el.scrollLeft;
    matrixScrollLeftRef.current = left;
    if (left === pagerLastLeftRef.current) {
      pagerStillFramesRef.current += 1;
      return;
    }
    pagerStillFramesRef.current = 0;
    pagerLastLeftRef.current = left;
    const progress = left / el.clientWidth;
    if (pagerTrackRef.current) {
      pagerTrackRef.current.style.transform = `translate3d(${-progress * 100}%, 0, 0)`;
    }
    const idx = Math.round(progress);
    setActiveDocIdx((prev) => (prev === idx ? prev : idx));

    // На десктопе в окне видно несколько колонок, поэтому clientWidth — это
    // не ширина врача. Берём ближайшую колонку по её реальной ширине.
    const column = el.firstElementChild as HTMLElement | null;
    const columnWidth = column?.getBoundingClientRect().width ?? 0;
    const focusedIdx = columnWidth > 0 ? Math.round(left / columnWidth) : idx;
    const focusedId = activeEmployeeIdsRef.current[focusedIdx] ?? null;
    if (focusedId != null) focusedEmployeeIdRef.current = focusedId;
  }, []);

  // Событие scroll браузер отдаёт реже кадров (а на инерционном скролле ещё и с
  // задержкой), поэтому по событию сдвигаем трек сразу, а дальше до конца
  // прокрутки ведём его в rAF-петле — иначе карточка догоняет расписание рывками.
  const handleMatrixScroll = React.useCallback(() => {
    syncPagerToScroll();
    if (pagerRafRef.current != null) return;
    const step = () => {
      if (!matrixScrollRef.current) {
        pagerRafRef.current = null;
        return;
      }
      syncPagerToScroll();
      // Несколько спокойных кадров подряд — прокрутка кончилась, петлю гасим.
      if (pagerStillFramesRef.current >= 4) {
        pagerRafRef.current = null;
        return;
      }
      pagerRafRef.current = requestAnimationFrame(step);
    };
    pagerRafRef.current = requestAnimationFrame(step);
  }, [syncPagerToScroll]);

  React.useEffect(
    () => () => {
      if (pagerRafRef.current != null) cancelAnimationFrame(pagerRafRef.current);
    },
    [],
  );

  const scrollToDoc = React.useCallback((idx: number) => {
    const el = matrixScrollRef.current;
    if (!el) return;
    const column = el.firstElementChild as HTMLElement | null;
    const columnWidth = column?.getBoundingClientRect().width || el.clientWidth;
    const safeIdx = Math.max(0, Math.min(idx, activeEmployeeIdsRef.current.length - 1));
    focusedEmployeeIdRef.current = activeEmployeeIdsRef.current[safeIdx] ?? null;
    const left = safeIdx * columnWidth;
    matrixScrollLeftRef.current = left;
    el.scrollTo({ left, behavior: "smooth" });
    setActiveDocIdx(safeIdx);
  }, []);

  // Шапку можно тянуть пальцем так же, как сетку: карточка — вторая «ручка»
  // той же карусели. Тянем не сам трек, а scrollLeft сетки — трек за ней
  // повторяет, поэтому расхождения между ними не появляется по определению.
  const pagerDragRef = React.useRef<{ startX: number; startLeft: number; moved: boolean } | null>(
    null,
  );
  /** Был ли последний жест перетаскиванием — тогда меню по клику не открываем. */
  const pagerDragMovedRef = React.useRef(false);

  const handlePagerPointerDown = React.useCallback((e: React.PointerEvent) => {
    const el = matrixScrollRef.current;
    if (!el || e.button !== 0) return;
    pagerDragRef.current = { startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    pagerDragMovedRef.current = false;
  }, []);

  const handlePagerPointerMove = React.useCallback((e: React.PointerEvent) => {
    const drag = pagerDragRef.current;
    const el = matrixScrollRef.current;
    if (!drag || !el) return;
    const dx = e.clientX - drag.startX;
    // Порог, чтобы дрожание пальца на тапе не считалось перетаскиванием.
    if (!drag.moved && Math.abs(dx) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      pagerDragMovedRef.current = true;
      // Со snap на сетке scrollLeft прилипал бы к колонке и палец «терял» карточку.
      el.style.scrollSnapType = "none";
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.startLeft - dx;
    matrixScrollLeftRef.current = el.scrollLeft;
  }, []);

  const handlePagerPointerUp = React.useCallback(() => {
    const drag = pagerDragRef.current;
    const el = matrixScrollRef.current;
    pagerDragRef.current = null;
    if (!drag || !el || !drag.moved) return;
    el.style.scrollSnapType = "";
    // Доводим до врача, как это делает snap после свайпа по сетке.
    if (el.clientWidth > 0) scrollToDoc(Math.round(el.scrollLeft / el.clientWidth));
  }, [scrollToDoc]);

  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStartX, setDragStartX] = React.useState(0);
  const [dragScrollLeft, setDragScrollLeft] = React.useState(0);
  const isDragMovedRef = React.useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = matrixScrollRef.current;
    if (!container) return;
    setIsDragging(true);
    isDragMovedRef.current = false;
    setDragStartX(e.pageX - container.offsetLeft);
    setDragScrollLeft(container.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const container = matrixScrollRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    if (Math.abs(x - dragStartX) > 4) {
      isDragMovedRef.current = true;
    }
    container.scrollLeft = dragScrollLeft - walk;
    matrixScrollLeftRef.current = container.scrollLeft;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleStripMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !stripRef.current) return;
    setIsStripDragging(true);
    stripDragMovedRef.current = false;
    stripDragStartXRef.current = e.pageX;
    stripScrollStartRef.current = stripRef.current.scrollLeft;
  };

  const handleStripMouseMove = (e: React.MouseEvent) => {
    if (!isStripDragging || !stripRef.current) return;
    const delta = e.pageX - stripDragStartXRef.current;
    if (Math.abs(delta) > 4) stripDragMovedRef.current = true;
    stripRef.current.scrollLeft = stripScrollStartRef.current - delta;
  };

  const handleStripMouseUpOrLeave = () => {
    setIsStripDragging(false);
  };

  // Специализация врача для подписи в мобильном пейджере. Прав на справочник
  // сотрудников может не быть (403) — тогда карта пустая и подпись деградирует
  // до общего «Специалист», как было раньше.
  const { employees: allEmployees } = useAllActiveEmployees();
  const specLabelByEmployee = React.useMemo(() => {
    const map = new Map<number, string>();
    allEmployees.forEach((emp) => {
      const names = emp.specializations.map((s) => s.name).filter(Boolean);
      if (names.length) map.set(emp.id, names.join(", "));
    });
    return map;
  }, [allEmployees]);

  // Справочник специализаций — левый рельс.
  const specsQuery = useQuery({
    queryKey: ["django", "scheduling", "specs", organizationId ?? null],
    queryFn: ({ signal }) => getSpecializations(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const specs: DjangoSpecialization[] = React.useMemo(
    () => (specsQuery.data ?? []).filter((s) => s.isActive),
    [specsQuery.data],
  );

  // По умолчанию открываем вид «Все специалисты» (specId === null), а не
  // какую-то конкретную специальность.

  // Бейджи всех специальностей приходят одной агрегированной сводкой, без N запросов.
  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.availabilitySummary({
      date: todayIso,
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getAvailabilitySummary({ date: todayIso, branchId, organizationId }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const badgeBySpec = React.useMemo(() => {
    const map = new Map<number, { free: number; total: number }>();
    summaryQuery.data?.specializations.forEach((specialization) => {
      map.set(specialization.specializationId, {
        free: specialization.freeEmployeeCount,
        total: specialization.employeeCount,
      });
    });
    return map;
  }, [summaryQuery.data]);

  // Загруженный диапазон дат — набор 30-дневных чанков вокруг «сегодня».
  // Каждый чанк — отдельный запрос availability (лимит бэка на один запрос —
  // 62 дня), поэтому суммарный горизонт ничем не ограничен.
  const chunks = React.useMemo(() => {
    const list: Array<{ from: string; to: string }> = [];
    for (let i = -pastChunks; i < futureChunks; i += 1) {
      const from = dayjs(todayIso).add(i * CHUNK_DAYS, "day");
      list.push({
        from: from.format("YYYY-MM-DD"),
        to: from.add(CHUNK_DAYS - 1, "day").format("YYYY-MM-DD"),
      });
    }
    return list;
  }, [pastChunks, futureChunks, todayIso]);

  const chunkQueries = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: djangoQueryKeys.scheduling.availability({
        specializationId: specId,
        dateFrom: chunk.from,
        dateTo: chunk.to,
        branchId: branchId ?? null,
        organizationId: organizationId ?? null,
      }),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        getAvailability(
          {
            specializationId: specId ?? undefined,
            dateFrom: chunk.from,
            dateTo: chunk.to,
            branchId,
            organizationId,
          },
          signal,
        ),
      staleTime: DJANGO_LIST_STALE_TIME_MS,
    })),
  });

  // Догрузка к краям не должна дёргаться, пока крайний чанк ещё в полёте.
  const pastEdgeLoading = chunkQueries[0]?.isLoading ?? false;
  const futureEdgeLoading = chunkQueries[chunkQueries.length - 1]?.isLoading ?? false;
  const hasAnyData = chunkQueries.some((q) => q.data);
  const isAvailLoading = chunkQueries.some((q) => q.isLoading) && !hasAnyData;

  // Один «виртуальный» ответ на весь загруженный диапазон: сотрудники те же,
  // дни чанков склеиваются по датам; nearestFree — самый ранний будущий.
  const chunkDataStamp = chunkQueries.map((q) => q.dataUpdatedAt).join(",");
  const mergedEmployees = React.useMemo<EmployeeAvailability[]>(() => {
    const byId = new Map<number, EmployeeAvailability>();
    for (const q of chunkQueries) {
      const data = q.data;
      if (!data) continue;
      for (const emp of data.employees) {
        const existing = byId.get(emp.employeeId);
        if (!existing) {
          byId.set(emp.employeeId, {
            ...emp,
            days: [...emp.days],
            nearestFree:
              emp.nearestFree && emp.nearestFree.date >= todayIso ? emp.nearestFree : null,
          });
        } else {
          existing.days.push(...emp.days);
          const candidate =
            emp.nearestFree && emp.nearestFree.date >= todayIso ? emp.nearestFree : null;
          if (candidate && (!existing.nearestFree || candidate.date < existing.nearestFree.date)) {
            existing.nearestFree = candidate;
          }
        }
      }
    }
    const merged = Array.from(byId.values());
    merged.forEach((emp) => emp.days.sort((a, b) => a.date.localeCompare(b.date)));
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chunkQueries пересоздаётся каждый рендер; штамп dataUpdatedAt отражает реальные изменения данных
  }, [chunkDataStamp, todayIso]);

  // Крайний чанк загрузился «пустым» — дальше в эту сторону грузить нечего,
  // автодогрузку останавливаем (пустой край зациклил бы расширение).
  // Критерии пустоты разные: в будущее — нет смен (расписание кончилось),
  // в прошлое — нет ни одного приёма (история клиники исчерпана).
  const pastExhausted = React.useMemo(() => {
    const q = chunkQueries[0];
    if (!q?.data) return false;
    return !q.data.employees.some(
      (emp) => emp.days.some((d) => (d.appointments?.length ?? 0) > 0),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. chunkDataStamp выше
  }, [chunkDataStamp]);
  const futureExhausted = React.useMemo(() => {
    const q = chunkQueries[chunkQueries.length - 1];
    if (!q?.data) return false;
    return !q.data.employees.some((emp) => emp.days.some((d) => d.scheduled));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. chunkDataStamp выше
  }, [chunkDataStamp]);

  const extendPast = React.useCallback(() => {
    if (!pastEdgeLoading && !pastExhausted) setPastChunks((n) => n + 1);
  }, [pastEdgeLoading, pastExhausted]);
  const extendFuture = React.useCallback(() => {
    if (!futureEdgeLoading && !futureExhausted) setFutureChunks((n) => n + 1);
  }, [futureEdgeLoading, futureExhausted]);

  // Врачи специальности + сводка, по алфавиту ФИО.
  //
  // Раньше список шёл «лучшие сверху» — сначала те, у кого сегодня есть
  // свободные окна, затем по ближайшей дате. Регистратуре это мешает: она
  // ищет конкретного врача по фамилии, а его место в списке съезжало от
  // загруженности дня, и глазами приходилось искать заново. Свободность
  // никуда не делась — она видна на самой карточке врача и в сетке.
  const docs = React.useMemo(() => {
    const list = mergedEmployees
      .map((emp) => ({
        emp,
        sum: summarize(emp, todayIso),
      }));
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((x) => x.emp.fullName.toLowerCase().includes(q)) : list;
    return filtered.sort((a, b) => a.emp.fullName.localeCompare(b.emp.fullName, "ru"));
  }, [mergedEmployees, search, todayIso]);

  // Сбрасываем выбор врача только если выбранного врача больше нет в отфильтрованном списке.
  React.useEffect(() => {
    if (selDocId !== null && !docs.some((x) => x.emp.employeeId === selDocId)) {
      setSelDocId(null);
    }
  }, [docs, selDocId]);

  const selectedDoc = docs.find((x) => x.emp.employeeId === selDocId) ?? null;
  // Выбор врача в рельсе — это фильтр сетки (отдельного экрана врача нет):
  // остаётся одна колонка, вид и поведение окон те же.
  const gridDocs = selectedDoc ? [selectedDoc] : docs;
  // В БУДУЩЕЕ навбар показывает смены, а также дни, где смены ни у кого нет,
  // но есть приёмы: иначе такой день исчезал из ленты вместе с приёмами, и
  // найти их во «Окнах» было нельзя. Выходные и дни без расписания и без
  // приёмов в ленту не попадают — они не должны выглядеть как даты, на которые
  // можно записать пациента (счётчик окон на плитке и так покажет «нет»).
  // В ПРОШЛОМ — только дни, где были приёмы (история); пустые дни (смена без
  // единого приёма или вообще без смены) в ленту не попадают.
  const selectableDays = React.useMemo(() => {
    const map = new Map<string, AvailabilityDay>();
    const source = selectedDoc ? [selectedDoc] : docs;
    for (const { emp } of source) {
      for (const d of emp.days) {
        const isPast = d.date < todayIso;
        const hasAppointments = (d.appointments?.length ?? 0) > 0;
        const include = isPast ? hasAppointments : d.scheduled || hasAppointments;
        if (!include) continue;
        const existing = map.get(d.date);
        if (!existing) {
          map.set(d.date, { ...d });
        } else {
          existing.freeCount += d.freeCount;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedDoc, docs, todayIso]);

  // День по умолчанию — ближайший С СЕГОДНЯ день с окнами: прошлые дни теперь
  // тоже в ленте (для просмотра), но стартовать с них нельзя.
  React.useEffect(() => {
    if (!selectableDays.length) return;
    const known = selDay != null && selectableDays.some((day) => day.date === selDay);
    // Чанки дат приходят вразнобой: если первым ответил прошлый чанк, автовыбор
    // приземлялся на прошедший день и больше не пересматривался — вкладка
    // открывалась на дне без окон, хотя сегодня их полсотни. Поэтому свой
    // же прошлый выбор пересматриваем, когда подъехали будущие дни. Выбор
    // пользователя (клик по плитке) при этом неприкосновенен.
    const staleAutoPick =
      !userPickedDayRef.current &&
      selDay != null &&
      selDay < todayIso &&
      selectableDays.some((day) => day.date >= todayIso);
    if (known && !staleAutoPick) return;
    const upcoming = selectableDays.filter((day) => day.date >= todayIso);
    const firstFree = upcoming.find((day) => day.freeCount > 0);
    setSelDay(
      firstFree?.date
        ?? upcoming[0]?.date
        ?? selectableDays[selectableDays.length - 1].date
        ?? todayIso,
    );
  }, [selectableDays, selDay, todayIso]);

  const selectedDay = selectableDays.find((day) => day.date === selDay) ?? null;

  // Колонка есть у врача со сменой в этот день, а также у врача без смены, но с
  // приёмами (приём вне планового расписания — так бывает). Пустых колонок при
  // этом не появляется: DayTimeline рисует такие приёмы и помечает их «вне
  // графика», а врач вообще без смены и без приёмов в список не попадает.
  const activeDayDate = selectedDay?.date ?? selDay ?? todayIso;
  const activeDocsOnDay = React.useMemo(
    () =>
      gridDocs.filter(({ emp }) => {
        const d = emp.days.find((x) => x.date === activeDayDate);
        if (!d) return false;
        if (d.scheduled && !d.dayOff) return true;
        return (d.appointments?.length ?? 0) > 0;
      }),
    [gridDocs, activeDayDate],
  );
  activeEmployeeIdsRef.current = activeDocsOnDay.map(({ emp }) => emp.employeeId);
  /** Состав колонок дня — по нему сбрасываем пейджер, см. эффект ниже. */
  const activeDocsKey = activeDocsOnDay.map(({ emp }) => emp.employeeId).join(",");

  // Смена дня пересобирает набор колонок. Возвращаемся к тому же врачу по id,
  // если он есть на новой дате; если врача в этот день нет — к первому.
  // Специальность и поиск начинают просмотр с первого совпадения.
  // Состав дня (activeDocsKey) в зависимостях нужен отдельно от selDay:
  // список может смениться и без смены дня (догрузился чанк, сняли фильтр),
  // а браузер сохраняет scrollLeft, и пейджер оставался на чужом индексе.
  // useLayoutEffect, а не useEffect: браузер сохраняет scrollLeft контейнера
  // при смене содержимого, и в обычном эффекте кадр успевал отрисоваться со
  // старой позицией — шапка показывала первого врача, а под ней оставалась
  // колонка предыдущего.
  React.useLayoutEffect(() => {
    const contextChanged =
      focusContextRef.current.specId !== specId || focusContextRef.current.search !== search;
    const preferredId = contextChanged ? null : focusedEmployeeIdRef.current;
    const preferredIdx = preferredId == null ? -1 : activeEmployeeIdsRef.current.indexOf(preferredId);
    const nextIdx = preferredIdx >= 0 ? preferredIdx : 0;
    const nextId = activeEmployeeIdsRef.current[nextIdx] ?? null;
    focusedEmployeeIdRef.current = nextId;
    focusContextRef.current = { specId, search };
    setActiveDocIdx(nextIdx);

    const el = matrixScrollRef.current;
    const column = el?.firstElementChild as HTMLElement | null;
    const columnWidth = column?.getBoundingClientRect().width ?? 0;
    const maxLeft = el ? Math.max(0, el.scrollWidth - el.clientWidth) : 0;
    const requestedLeft =
      preferredIdx >= 0
        ? nextIdx * columnWidth
        : contextChanged
          ? 0
          : matrixScrollLeftRef.current;
    const left = Math.min(Math.max(0, requestedLeft), maxLeft);
    matrixScrollLeftRef.current = left;
    el?.scrollTo({ left });
    pagerLastLeftRef.current = left;
    if (pagerTrackRef.current) {
      const progress = el?.clientWidth ? left / el.clientWidth : 0;
      pagerTrackRef.current.style.transform = `translate3d(${-progress * 100}%, 0, 0)`;
    }
  }, [selDay, specId, search, activeDocsKey]);

  const selectedMonth = dayjs(selectedDay?.date ?? selectableDays[0]?.date ?? todayIso);
  const selectedMonthLabel = `${MONTHS_NOMINATIVE[selectedMonth.month()]} ${selectedMonth.year()}`;

  // Стрелки: у края (или когда все дни влезли и скроллить нечего) они
  // расширяют диапазон дат, иначе — обычная прокрутка ленты.
  const scrollStrip = (dir: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    const short = strip.scrollWidth <= strip.clientWidth + 1;
    if (dir === -1 && (short || strip.scrollLeft < 1)) {
      extendPast();
      return;
    }
    const rightGap = strip.scrollWidth - strip.scrollLeft - strip.clientWidth;
    if (dir === 1 && (short || rightGap < 1)) {
      extendFuture();
      return;
    }
    strip.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  // Если ближайшая смена находится далеко от сегодняшней даты, выбранный день
  // должен сразу оказаться в видимой части горизонтальной ленты. Центрируем
  // только при смене выбранного дня, а не при каждой догрузке чанков —
  // иначе лента «прыгала» бы обратно к выбранному дню при подгрузке краёв.
  const centeredDayRef = React.useRef<string | null>(null);
  // Смена фильтра пересобирает ленту (у другого специалиста другие смены),
  // поэтому разрешаем центрировать активный день заново. Догрузка чанков ref
  // не трогает — иначе лента прыгала бы обратно при подгрузке краёв.
  React.useEffect(() => {
    centeredDayRef.current = null;
  }, [search, specId]);

  React.useEffect(() => {
    const strip = stripRef.current;
    // Пока день не выбран вручную, активен сегодняшний — центрируем и его,
    // иначе после фильтра лента показывала произвольный кусок расписания,
    // а подсвеченного дня в видимой части не было (на телефоне туда влезает
    // всего пять плиток, поэтому промах особенно заметен).
    const targetDay = selDay ?? todayIso;
    if (!strip) return;
    if (centeredDayRef.current === targetDay) return;
    const dayButton = strip.querySelector<HTMLElement>(`[data-slot-date="${targetDay}"]`);
    if (!dayButton) return;
    const left = dayButton.offsetLeft - (strip.clientWidth - dayButton.clientWidth) / 2;
    // Прокрутка мгновенная, а не smooth: пока шла анимация, догрузка соседнего
    // чанка успевала компенсировать scrollLeft, анимация доезжала до старой
    // цели, и лента вставала на произвольную дату вместо активной.
    strip.scrollTo({ left: Math.max(0, left) });
    // Метку ставим только когда день действительно оказался на экране: на
    // первых рендерах лента ещё пуста, и одна неудачная попытка не должна
    // отменять центрирование навсегда.
    const stripBox = strip.getBoundingClientRect();
    const dayBox = dayButton.getBoundingClientRect();
    if (dayBox.left >= stripBox.left - 1 && dayBox.right <= stripBox.right + 1) {
      centeredDayRef.current = targetDay;
    }
  }, [selDay, todayIso, selectableDays]);

  // ── Бесконечная лента: догрузка чанков при прокрутке к краям ──
  // При догрузке прошлого контент добавляется СЛЕВА — компенсируем scrollLeft,
  // чтобы лента визуально не дёргалась.
  const stripFirstDateRef = React.useRef<string | null>(null);
  const stripPrevWidthRef = React.useRef(0);
  React.useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const firstDate = selectableDays[0]?.date ?? null;
    const prevFirst = stripFirstDateRef.current;
    if (firstDate && prevFirst && firstDate < prevFirst) {
      strip.scrollLeft += strip.scrollWidth - stripPrevWidthRef.current;
    }
    stripFirstDateRef.current = firstDate;
    stripPrevWidthRef.current = strip.scrollWidth;
  }, [selectableDays]);

  // Скролл-триггер расширения. Обязательные предохранители от лавины
  // (короткая лента «близка» к обоим краям сразу, а каждый scroll-event
  // без троттла раздувал диапазон до фриза вкладки):
  //  - не чаще одного раза за кадр (rAF);
  //  - только когда лента длиннее контейнера (короткая растёт стрелками);
  //  - одна сторона за событие.
  const stripTickRef = React.useRef(false);
  const maybeExtendStrip = React.useCallback(() => {
    if (stripTickRef.current) return;
    stripTickRef.current = true;
    requestAnimationFrame(() => {
      stripTickRef.current = false;
      const strip = stripRef.current;
      if (!strip) return;
      if (strip.scrollWidth <= strip.clientWidth + 1) return;
      const rightGap = strip.scrollWidth - strip.scrollLeft - strip.clientWidth;
      if (strip.scrollLeft < STRIP_LOAD_THRESHOLD_PX) {
        extendPast();
        return;
      }
      if (rightGap < STRIP_LOAD_THRESHOLD_PX) {
        extendFuture();
      }
    });
  }, [extendPast, extendFuture]);

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ── Верхний навбар дат и кнопка переключения режимов ── */}
      {/* На узких экранах (до md) шапка переносится в две строки: месяц и
          переключатель режимов сверху, лента дат во всю ширину под ними —
          иначе ленте оставалось несколько пикселей и она схлопывалась в
          нечитаемый столбик. Порядок задаётся order + переносом по wrap. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 0.75,
          columnGap: 1,
          mb: 1,
          flexShrink: 0,
        }}
      >
        <Typography
          variant="subtitle2"
          fontWeight={600}
          sx={{ order: 0, flexShrink: 0, mr: { xs: 0, md: 1 }, whiteSpace: "nowrap" }}
        >
          {selectedMonthLabel}
        </Typography>
        {selectableDays.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ order: { xs: 3, md: 1 }, fontWeight: 500 }}>
            {t("slots.noShifts")}
          </Typography>
        ) : (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{
              order: { xs: 3, md: 1 },
              minWidth: 0,
              flex: { xs: "1 0 100%", md: 1 },
              width: { xs: "100%", md: "auto" },
            }}
          >
            <Box
              onClick={() => scrollStrip(-1)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "8px",
                flexShrink: 0,
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "text.secondary",
                "@media (hover: hover)": {
                  "&:hover": { bgcolor: subtleBg(theme, true), color: "text.primary" },
                },
              }}
            >
              <KeyboardArrowLeftOutlined sx={{ fontSize: 18 }} />
            </Box>
            <Stack
              ref={stripRef}
              direction="row"
              spacing={0.75}
              onMouseDown={isFinePointer ? handleStripMouseDown : undefined}
              onMouseMove={isFinePointer ? handleStripMouseMove : undefined}
              onMouseUp={isFinePointer ? handleStripMouseUpOrLeave : undefined}
              onMouseLeave={isFinePointer ? handleStripMouseUpOrLeave : undefined}
              onScroll={maybeExtendStrip}
              sx={{
                overflowX: "auto",
                touchAction: "pan-x",
                py: 0.25,
                px: 0.5,
                flex: 1,
                cursor: isFinePointer ? (isStripDragging ? "grabbing" : "grab") : "default",
                userSelect: isStripDragging ? "none" : "auto",
                "&::-webkit-scrollbar": { height: 4 },
              }}
            >
              {pastEdgeLoading && (
                <Stack alignItems="center" justifyContent="center" sx={{ flex: "0 0 auto", px: 1 }}>
                  <CircularProgress size={14} />
                </Stack>
              )}
              {selectableDays.map((d) => {
                const dj = dayjs(d.date);
                const active = d.date === selDay;
                const isToday = d.date === todayIso;
                return (
                  <Box
                    key={d.date}
                    data-slot-date={d.date}
                    onClick={() => {
                      if (stripDragMovedRef.current) return;
                      userPickedDayRef.current = true;
                      setSelDay(d.date);
                    }}
                    sx={{
                      flex: "0 0 auto",
                      minWidth: 60,
                      textAlign: "center",
                      borderRadius: "9px",
                      border: "1px solid",
                      borderColor: active ? "primary.main" : "divider",
                      bgcolor: active
                        ? alpha(theme.palette.primary.main, 0.1)
                        : "background.paper",
                      px: 0.75,
                      py: 0.5,
                      cursor: "pointer",
                      transition: "border-color .13s ease, background-color .13s ease",
                      "@media (hover: hover)": {
                        "&:hover": { borderColor: active ? "primary.main" : alpha(theme.palette.primary.main, 0.28) },
                      },
                      "&:active": {
                        borderColor: "primary.main",
                        bgcolor: alpha(theme.palette.primary.main, 0.16),
                      },
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.625rem" }}>
                      {WEEKDAY_SHORT[mondayIndex(dj)]}
                      <Box
                        component="span"
                        sx={{
                          display: { xs: "inline", md: "none" },
                          color: d.freeCount > 0 ? "success.main" : "text.disabled",
                          fontWeight: d.freeCount > 0 ? 600 : 400,
                        }}
                      >
                        {" · "}
                        {d.freeCount > 0 ? String(d.freeCount) : t("slots.none")}
                      </Box>
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      sx={{ fontSize: "0.775rem", color: isToday ? "primary.onSurface" : "text.primary", whiteSpace: "nowrap" }}
                    >
                      {dj.date()} {MONTHS_SHORT[dj.month()]}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: { xs: "none", md: "block" },
                        fontSize: "0.625rem",
                        color: d.freeCount > 0 ? "success.main" : "text.disabled",
                        fontWeight: d.freeCount > 0 ? 600 : 400,
                      }}
                    >
                      {d.freeCount > 0 ? String(d.freeCount) : t("slots.none")}
                    </Typography>
                  </Box>
                );
              })}
              {futureEdgeLoading && (
                <Stack alignItems="center" justifyContent="center" sx={{ flex: "0 0 auto", px: 1 }}>
                  <CircularProgress size={14} />
                </Stack>
              )}
            </Stack>
            <Box
              onClick={() => scrollStrip(1)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "8px",
                flexShrink: 0,
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "text.secondary",
                "@media (hover: hover)": {
                  "&:hover": { bgcolor: subtleBg(theme, true), color: "text.primary" },
                },
              }}
            >
              <KeyboardArrowRightOutlined sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
        )}
        <Box sx={{ order: 2, ml: "auto", flexShrink: 0 }}>{headerActions}</Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "204px 1fr" },
          gridAutoRows: { xs: "minmax(0, 1fr)", md: "100%" },
        }}
      >
        {/* ── Рельс специальностей: только десктоп. На телефоне фильтра по
            специальностям нет вовсе — он занимал целый ряд ради того, что и так
            подписано у врача в пейджере ниже. ── */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            overflowY: "auto",
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, px: 2, pt: 1.5, pb: 1 }}
          >
            {t("slots.specialities")}
          </Typography>
          {specsQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={20} />
            </Stack>
          ) : (
            <>
              {(() => {
                const active = specId === null;
                const overall = summaryQuery.data
                  ? { free: summaryQuery.data.overallFreeEmployeeCount, total: summaryQuery.data.overallEmployeeCount }
                  : undefined;
                return (
                  <React.Fragment>
                    <Box
                      onClick={() => {
                        if (specId !== null) {
                          setSpecId(null);
                          setSelDocId(null);
                          setSelDay(null);
                          setCollapsedGroup("all");
                        } else if (collapsedGroup === "all") {
                          setCollapsedGroup(null);
                        } else {
                          setCollapsedGroup("all");
                          setSelDocId(null);
                        }
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        px: 1.75,
                        py: 1.25,
                        cursor: "pointer",
                        borderLeft: "3px solid",
                        borderColor: active ? "primary.main" : "transparent",
                        bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                        transition: "background-color .13s ease",
                        "@media (hover: hover)": {
                          "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                        },
                      }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={active ? 600 : 500}
                        sx={{ flex: 1, minWidth: 0 }}
                        noWrap
                      >
                        {t("slots.allSpecialists")}
                      </Typography>
                      <KeyboardArrowRightOutlined
                        sx={{
                          fontSize: 17,
                          flexShrink: 0,
                          transform: collapsedGroup === "all" ? "none" : "rotate(90deg)",
                          transition: "transform .13s ease",
                        }}
                      />
                      {overall && (
                        <Box
                          sx={(t) => ({
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            lineHeight: 1,
                            px: 0.75,
                            py: 0.5,
                            borderRadius: "7px",
                            color: overall.free ? "success.dark" : "text.disabled",
                            bgcolor: overall.free
                              ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                              : subtleBg(t, true),
                            ...(t.palette.mode === "dark" && overall.free ? { color: t.palette.success.light } : {}),
                          })}
                          title={t("slots.freeToday")}
                        >
                          {overall.free}/{overall.total}
                        </Box>
                      )}
                    </Box>

                    <Collapse
                      in={active && collapsedGroup !== "all"}
                      timeout={{ enter: 240, exit: 180 }}
                      easing={{ enter: "cubic-bezier(0.22, 1, 0.36, 1)", exit: "cubic-bezier(0.4, 0, 1, 1)" }}
                      unmountOnExit
                      // flexShrink: 0 обязателен: рельс — это flex-колонка со скроллом,
                      // а у Collapse overflow: hidden (min-height: auto → 0), поэтому
                      // иначе флексбокс ужимает раскрытый список до нулевой высоты.
                      sx={{ flexShrink: 0, overflow: "hidden" }}
                    >
                      <DocRailList
                        docs={docs}
                        selectedId={selDocId}
                        loading={isAvailLoading}
                        onSelect={setSelDocId}
                        onSearch={searchByDoctor}
                      />
                    </Collapse>
                  </React.Fragment>
                );
              })()}
              {specs.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 2 }}>
                  {t("slots.noSpecialities")}
                </Typography>
              ) : (
                specs.map((s) => {
                  const active = s.id === specId;
                  const badge = badgeBySpec.get(s.id);
                  return (
                    <React.Fragment key={s.id}>
                      <Box
                        onClick={() => {
                          if (specId !== s.id) {
                            setSpecId(s.id);
                            setSelDocId(null);
                            setSelDay(null);
                            setCollapsedGroup(null);
                          } else if (collapsedGroup === s.id) {
                            setCollapsedGroup(null);
                          } else {
                            setCollapsedGroup(s.id);
                            setSelDocId(null);
                          }
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                          px: 1.75,
                          py: 1.25,
                          cursor: "pointer",
                          borderLeft: "3px solid",
                          borderColor: active ? "primary.main" : "transparent",
                          bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                          transition: "background-color .13s ease",
                          "@media (hover: hover)": {
                            "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                          },
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={active ? 600 : 500}
                          sx={{ flex: 1, minWidth: 0 }}
                          noWrap
                        >
                          {s.name}
                        </Typography>
                        <KeyboardArrowRightOutlined
                          sx={{
                            fontSize: 17,
                            flexShrink: 0,
                            transform: collapsedGroup === s.id ? "none" : "rotate(90deg)",
                            transition: "transform .13s ease",
                          }}
                        />
                        {badge && (
                          <Box
                            sx={(t) => ({
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              lineHeight: 1,
                              px: 0.75,
                              py: 0.5,
                              borderRadius: "7px",
                              color: badge.free ? "success.dark" : "text.disabled",
                              bgcolor: badge.free
                                ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                                : subtleBg(t, true),
                              ...(t.palette.mode === "dark" && badge.free ? { color: t.palette.success.light } : {}),
                            })}
                            title={t("slots.freeToday")}
                          >
                            {badge.free}/{badge.total}
                          </Box>
                        )}
                      </Box>

                      {/* Список сотрудников выбранной специальности */}
                      <Collapse
                        in={active && collapsedGroup !== s.id}
                        timeout={{ enter: 240, exit: 180 }}
                        easing={{ enter: "cubic-bezier(0.22, 1, 0.36, 1)", exit: "cubic-bezier(0.4, 0, 1, 1)" }}
                        unmountOnExit
                        sx={{ flexShrink: 0, overflow: "hidden" }}
                      >
                        <DocRailList
                          docs={docs}
                          selectedId={selDocId}
                          loading={isAvailLoading}
                          onSelect={setSelDocId}
                          onSearch={searchByDoctor}
                        />
                      </Collapse>
                    </React.Fragment>
                  );
                })
              )}
            </>
          )}
        </Box>

        {/* ── Правая колонка: сетка врачей ── */}
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            p: 0,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{
              display: { xs: "none", md: "flex" },
              px: 2,
              py: 1.25,
              borderBottom: "1px solid",
              borderColor: "divider",
              flexShrink: 0,
              bgcolor: "background.paper",
            }}
          >
            <TextField
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("slots.searchSpecialist")}
              sx={{ width: 260 }}
              InputProps={{
                startAdornment: (
                  <SearchOutlined sx={{ fontSize: 18, color: "text.disabled", mr: 0.75 }} />
                ),
                endAdornment: search ? (
                  <IconButton
                    size="small"
                    aria-label={t("slots.searchClose")}
                    onClick={() => setSearch("")}
                  >
                    <CloseOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                ) : undefined,
              }}
            />
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {t("slots.grid")}{" "}
                {specId
                  ? `(${specs.find((s) => s.id === specId)?.name})`
                  : t("slots.allSpecialistsOption")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("slots.foundSpecialists", { count: gridDocs.length })}
              </Typography>
            </Box>
          </Stack>

          {/* ── Мобильная шапка панели: поиск врача и пейджер по врачам дня.
              Заменяет собой и ряд чипов специальностей, и десктопную шапку. ── */}
          <Box
            sx={{
              display: { xs: "flex", md: "none" },
              alignItems: "center",
              gap: 0.5,
              // Без боковых отступов: трек пейджера должен быть ровно той же
              // ширины, что и колонка расписания под ним, иначе карточка едет
              // чуть медленнее сетки и это читается как рассинхрон. Отступы
              // живут внутри карточек и полей.
              px: 0,
              py: 0.75,
              flexShrink: 0,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {mobileSearchOpen ? (
              <TextField
                size="small"
                autoFocus
                fullWidth
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("slots.searchSpecialist")}
                sx={{ mx: 0.5 }}
                InputProps={{
                  startAdornment: (
                    <SearchOutlined sx={{ fontSize: 18, color: "text.disabled", mr: 0.75 }} />
                  ),
                  endAdornment: (
                    <IconButton
                      size="small"
                      aria-label={t("slots.searchClose")}
                      onClick={() => {
                        setSearch("");
                        setMobileSearchOpen(false);
                      }}
                    >
                      <CloseOutlined sx={{ fontSize: 16 }} />
                    </IconButton>
                  ),
                }}
              />
            ) : (
              <>
                {activeDocsOnDay.length === 0 ? (
                  <>
                    <IconButton
                      size="small"
                      aria-label={t("slots.searchSpecialist")}
                      onClick={() => setMobileSearchOpen(true)}
                      sx={{
                        flexShrink: 0,
                        ml: 0.5,
                        border: "1px solid",
                        borderColor: search ? "primary.main" : "divider",
                        borderRadius: "8px",
                        color: search ? "primary.main" : "text.secondary",
                      }}
                    >
                      <SearchOutlined sx={{ fontSize: 18 }} />
                    </IconButton>
                    <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                      {t("slots.foundSpecialists", { count: gridDocs.length })}
                    </Typography>
                  </>
                ) : (() => {
                  // Пейджер врача: кто сейчас перед глазами, его специализация,
                  // сколько у него свободных окон и позиция в списке дня.
                  // Тап по имени открывает выбор из всех врачей дня.
                  // Карточки всех врачей дня лежат в одном треке и едут вместе с
                  // колонками расписания — сдвиг трека считает handleMatrixScroll.
                  const many = activeDocsOnDay.length > 1;
                  const safeIdx = Math.min(activeDocIdx, activeDocsOnDay.length - 1);
                  return (
                    <Box
                      sx={{
                        position: "relative",
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {/* Трек во всю ширину шапки, стрелки и счётчик — поверх него.
                          Иначе окно карусели было бы уже колонки расписания на
                          ширину кнопок, карточка ехала бы медленнее сетки, и
                          движение читалось бы как рассинхрон. Теперь шаг трека
                          равен шагу колонки, а край текста гасит маска. */}
                      <Box
                        onClick={(e) => {
                          if (pagerDragMovedRef.current) return;
                          if (many) {
                            setDocMenuAnchor(e.currentTarget);
                          } else {
                            const onlyDoc = activeDocsOnDay[0]?.emp;
                            if (onlyDoc) {
                              searchByDoctor(onlyDoc.fullName);
                              setMobileSearchOpen(true);
                            }
                          }
                        }}
                        onPointerDown={handlePagerPointerDown}
                        onPointerMove={handlePagerPointerMove}
                        onPointerUp={handlePagerPointerUp}
                        onPointerCancel={handlePagerPointerUp}
                        aria-label={t("slots.chooseSpecialist")}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          py: 0.5,
                          borderRadius: "10px",
                          cursor: many ? "grab" : "pointer",
                          // Горизонталь забираем себе, вертикальный скролл
                          // страницы оставляем браузеру.
                          touchAction: "pan-y",
                          userSelect: "none",
                          ...(many
                            ? {
                                maskImage: PAGER_EDGE_MASK,
                                WebkitMaskImage: PAGER_EDGE_MASK,
                              }
                            : null),
                          "&:active": { bgcolor: subtleBg(theme) },
                          "@media (hover: hover)": {
                            "&:hover": { bgcolor: subtleBg(theme) },
                          },
                        }}
                      >
                        <Box
                          ref={pagerTrackRef}
                          sx={{ display: "flex", width: "100%", willChange: "transform" }}
                        >
                          {activeDocsOnDay.map(({ emp }) => {
                            const day = emp.days.find((x) => x.date === activeDayDate);
                            const free = day?.freeCount ?? 0;
                            const appts = day?.appointments?.length ?? 0;
                            // Врач попал в колонки по приёмам, а не по смене: пишем это
                            // прямо в пейджере, иначе «нет окон» выглядит как «всё занято».
                            const offSchedule =
                              Boolean(day) && (!day!.scheduled || day!.dayOff) && appts > 0;
                            const specLabel =
                              specLabelByEmployee.get(emp.employeeId) ?? t("slots.specialist");
                            return (
                              <Stack
                                key={emp.employeeId}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                                sx={{
                                  flex: "0 0 100%",
                                  minWidth: 0,
                                  // Место под наложенные стрелки и счётчик, чтобы в
                                  // покое имя не оказалось под ними.
                                  pl: many ? `${PAGER_ARROW_ZONE}px` : 0.75,
                                  pr: many ? `${PAGER_COUNTER_ZONE}px` : 0.75,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: "9px",
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#fff",
                                    fontSize: "0.7rem",
                                    fontWeight: 600,
                                    bgcolor: avatarColor(emp.fullName),
                                  }}
                                >
                                  {initials(emp.fullName)}
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    noWrap
                                    sx={{ lineHeight: 1.25 }}
                                  >
                                    {shortName(emp.fullName)}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{
                                      display: "block",
                                      fontSize: "0.6875rem",
                                      color: "text.secondary",
                                    }}
                                  >
                                    {specLabel}
                                    {" · "}
                                    {offSchedule ? (
                                      <Box
                                        component="span"
                                        sx={{ color: "warning.main", fontWeight: 600 }}
                                      >
                                        {t("slots.offSchedule")}
                                        {" · "}
                                        {t("slots.visitsCount", { count: appts })}
                                      </Box>
                                    ) : (
                                      <Box
                                        component="span"
                                        sx={{
                                          color: free > 0 ? "success.main" : "text.disabled",
                                          fontWeight: free > 0 ? 600 : 400,
                                        }}
                                      >
                                        {free > 0
                                          ? t("slots.freeSlotsCountShort", { count: free })
                                          : t("slots.noSlotsShort")}
                                      </Box>
                                    )}
                                  </Typography>
                                </Box>
                              </Stack>
                            );
                          })}
                        </Box>
                      </Box>

                      {many && (
                        <IconButton
                          size="small"
                          aria-label={t("slots.pagerPrev")}
                          disabled={safeIdx <= 0}
                          onClick={() => scrollToDoc(safeIdx - 1)}
                          sx={{ position: "absolute", left: 0, zIndex: 1 }}
                        >
                          <KeyboardArrowLeftOutlined sx={{ fontSize: 20 }} />
                        </IconButton>
                      )}

                      {many ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            position: "absolute",
                            right: `${PAGER_ARROW_ZONE}px`,
                            zIndex: 1,
                            fontVariantNumeric: "tabular-nums",
                            pointerEvents: "none",
                          }}
                        >
                          {safeIdx + 1}/{activeDocsOnDay.length}
                        </Typography>
                      ) : (
                        <ExpandMoreOutlined
                          sx={{
                            position: "absolute",
                            right: 4,
                            fontSize: 18,
                            color: "text.secondary",
                            pointerEvents: "none",
                          }}
                        />
                      )}

                      {many && (
                        <IconButton
                          size="small"
                          aria-label={t("slots.pagerNext")}
                          disabled={safeIdx >= activeDocsOnDay.length - 1}
                          onClick={() => scrollToDoc(safeIdx + 1)}
                          sx={{ position: "absolute", right: 0, zIndex: 1 }}
                        >
                          <KeyboardArrowRightOutlined sx={{ fontSize: 20 }} />
                        </IconButton>
                      )}

                      <Menu
                        anchorEl={docMenuAnchor}
                        open={Boolean(docMenuAnchor)}
                        onClose={() => setDocMenuAnchor(null)}
                        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                        transformOrigin={{ vertical: "top", horizontal: "center" }}
                        slotProps={{ paper: { sx: { maxHeight: 360, minWidth: 268, borderRadius: "12px" } } }}
                      >
                        <MenuItem
                          onClick={() => {
                            setDocMenuAnchor(null);
                            setMobileSearchOpen(true);
                          }}
                          sx={{ gap: 1.25, py: 1 }}
                        >
                          <SearchOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
                          <ListItemText
                            primary={t("slots.searchSpecialist")}
                            primaryTypographyProps={{ variant: "body2" }}
                          />
                        </MenuItem>
                        <Divider sx={{ my: 0.5 }} />
                        {activeDocsOnDay.map(({ emp }, idx) => {
                          const day = emp.days.find((x) => x.date === activeDayDate);
                          const free = day?.freeCount ?? 0;
                          const dayAppts = day?.appointments?.length ?? 0;
                          const itemOffSchedule =
                            Boolean(day) && (!day!.scheduled || day!.dayOff) && dayAppts > 0;
                          const selected = idx === safeIdx;
                          const itemSpec = specLabelByEmployee.get(emp.employeeId) ?? t("slots.specialist");
                          return (
                            <MenuItem
                              key={emp.employeeId}
                              selected={selected}
                              onClick={() => {
                                const doctor = activeDocsOnDay[idx]?.emp;
                                if (doctor) {
                                  searchByDoctor(doctor.fullName);
                                  setMobileSearchOpen(true);
                                }
                                setDocMenuAnchor(null);
                              }}
                              sx={{ gap: 1.25, py: 1 }}
                            >
                              <Box
                                sx={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "8px",
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#fff",
                                  fontSize: "0.6875rem",
                                  fontWeight: 600,
                                  bgcolor: avatarColor(emp.fullName),
                                }}
                              >
                                {initials(emp.fullName)}
                              </Box>
                              <ListItemText
                                primary={emp.fullName}
                                secondary={
                                  itemOffSchedule
                                    ? `${itemSpec} · ${t("slots.offSchedule")} · ${t("slots.visitsCount", { count: dayAppts })}`
                                    : free > 0
                                      ? `${itemSpec} · ${t("slots.freeSlotsCount", { count: free })}`
                                      : `${itemSpec} · ${t("slots.noFreeSlotsShort")}`
                                }
                                primaryTypographyProps={{ variant: "body2", fontWeight: 600, noWrap: true }}
                                secondaryTypographyProps={{
                                  variant: "caption",
                                  sx: {
                                    color: itemOffSchedule
                                      ? "warning.main"
                                      : free > 0
                                        ? "success.main"
                                        : "text.disabled",
                                  },
                                }}
                              />
                              {selected && (
                                <CheckOutlined sx={{ fontSize: 16, color: "primary.main", flexShrink: 0 }} />
                              )}
                            </MenuItem>
                          );
                        })}
                      </Menu>
                    </Box>
                  );
                })()}
              </>
            )}
          </Box>

          {(() => {
            const isMatrixLoading = (isAvailLoading || summaryQuery.isLoading) && !hasAnyData;

            if (isMatrixLoading) {
              return (
                <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 12, flex: 1 }}>
                  <CircularProgress size={36} />
                  <Typography variant="body2" color="text.secondary">
                    Загрузка расписания врачей…
                  </Typography>
                </Stack>
              );
            }

            if (docs.length === 0) {
              return (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8, flex: 1 }}>
                  <PersonSearchOutlined sx={{ fontSize: 36, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.disabled">
                    {search
                      ? t("slots.specialistsNotFoundByQuery")
                      : t("slots.specialistsNotFound")}
                  </Typography>
                </Stack>
              );
            }

            if (activeDocsOnDay.length === 0) {
              return (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8, flex: 1 }}>
                  <PersonSearchOutlined sx={{ fontSize: 36, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.disabled">
                    {t("slots.noShiftsOnDate")}
                  </Typography>
                </Stack>
              );
            }

            return (
              <Box
                ref={matrixScrollRef}
                onScroll={handleMatrixScroll}
                onMouseDown={isFinePointer ? handleMouseDown : undefined}
                onMouseMove={isFinePointer ? handleMouseMove : undefined}
                onMouseUp={isFinePointer ? handleMouseUpOrLeave : undefined}
                onMouseLeave={isFinePointer ? handleMouseUpOrLeave : undefined}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "row",
                  overflowX: "auto",
                  // mandatory, а не proximity: с proximity короткий свайп
                  // возвращался на прежнего врача или замирал между колонками —
                  // на экране оказывались две половины расписания. Теперь любой
                  // свайп доводится до колонки, то есть до следующего врача.
                  scrollSnapType: { xs: "x mandatory", md: "none" },
                  WebkitOverflowScrolling: "touch",
                  cursor: isFinePointer ? (isDragging ? "grabbing" : "grab") : "default",
                  userSelect: isDragging ? "none" : "auto",
                  "&::-webkit-scrollbar": { height: 6 },
                }}
              >
                {activeDocsOnDay.map(({ emp, sum }) => {
                  const docDay = emp.days.find((d) => d.date === activeDayDate)!;
                  const specName = specId ? specs.find((s) => s.id === specId)?.name : null;
                  const docOffSchedule =
                    Boolean(docDay) &&
                    (!docDay.scheduled || docDay.dayOff) &&
                    (docDay.appointments?.length ?? 0) > 0;

                  return (
                    <Box
                      key={emp.employeeId}
                      sx={{
                        // Сетка не растягивает карточки по числу врачей:
                        // на десктопе — по трети панели; на телефоне колонка
                        // занимает экран целиком и листается свайпом (ориентир —
                        // полоса аватаров над сеткой).
                        flex: { xs: "0 0 100%", md: "0 0 33.3333%" },
                        minWidth: 175,
                        scrollSnapAlign: { xs: "start", md: "none" },
                        // Один свайп — ровно один врач: без этого инерция
                        // пролетала мимо двух-трёх колонок и было непонятно,
                        // кого показали.
                        scrollSnapStop: { xs: "always", md: "normal" },
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        borderRight: "1px solid",
                        borderColor: "divider",
                        "&:last-of-type": {
                          borderRight: "none",
                        },
                      }}
                    >
                      {/* Шапка врача в колонке — подпись, а не кнопка:
                          отдельного экрана врача в режиме окон нет. */}
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                        sx={(tokens) => ({
                          display: {
                            xs: activeDocsOnDay.length > 1 ? "none" : "flex",
                            md: "flex",
                          },
                          px: 1.25,
                          py: 1,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          bgcolor: subtleBg(tokens),
                          cursor: "pointer",
                          "&:hover": { bgcolor: alpha(tokens.palette.primary.main, 0.08) },
                        })}
                        onClick={() => searchByDoctor(emp.fullName)}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ position: "relative", flexShrink: 0 }}>
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: "9px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                bgcolor: avatarColor(emp.fullName),
                              }}
                            >
                              {initials(emp.fullName)}
                            </Box>
                            <Box
                              sx={{
                                position: "absolute",
                                right: -2,
                                bottom: -2,
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                border: "2px solid",
                                borderColor: "background.paper",
                                bgcolor: STATUS_DOT[sum.status],
                              }}
                            />
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: "0.8125rem", lineHeight: 1.2 }}>
                              {emp.fullName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontSize: "0.6875rem" }}>
                              {specName ?? t("slots.specialist")}
                              {docOffSchedule && (
                                <Box component="span" sx={{ color: "warning.main", fontWeight: 600 }}>
                                  {" · "}
                                  {t("slots.offSchedule")}
                                </Box>
                              )}
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>

                      {/* Таймлайн окон и приёмов за день */}
                      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1 }}>
                        {!docDay ? (
                          <Alert severity="info" icon={false}>{t("slots.noSchedule")}</Alert>
                        ) : (
                          <DayTimeline
                            day={docDay}
                            employeeId={emp.employeeId}
                            dense
                            onBook={onBook}
                            onOpenAppointment={onOpenAppointment}
                            dragMovedRef={isDragMovedRef}
                            onWaitlist={onWaitlist}
                          />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            );
          })()}
        </Box>
      </Box>
    </Box>
  );
};

export default FreeSlotsView;
