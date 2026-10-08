/**
 * DjangoConclusionDrawer
 *
 * Drawer for creating, editing, or viewing a medical conclusion attached to
 * a specific AppointmentServiceLine.
 *
 * Behaviour:
 * - readOnly=true  → all fields disabled, no save button
 * - canEdit=true   → can save as draft or completed
 * - completed requires non-empty conclusion field
 * - Vitals validated: weight 1..999, height 1..999, temperature 34..42
 * - On save: calls onSaved() so parent can refresh slots
 */

import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid,
  IconButton,
  LinearProgress,
  Modal,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import StarOutlined from "@mui/icons-material/StarOutlined";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import PreviewOutlined from "@mui/icons-material/PreviewOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import { useNotification } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { useFormValidation } from "../../hooks/useFormValidation";
import { useKeyboardViewportHeight } from "../../hooks/useKeyboardViewportHeight";
import { formatQuantity, trimDecimalInput } from "../../utility/format";
import { PHOTO_ACCEPT } from "../../utility/imageCompression";
import { useT } from "../../i18n/VerticalProvider";
import { agree } from "../../i18n/formatters";
import { ConclusionFormInline } from "../../components/conclusion-forms/ConclusionFormInline";
import { ConclusionDocumentMenu } from "../../components/conclusion-forms/ConclusionDocumentMenu";
import { ConclusionSheetPane } from "../../components/conclusion-forms/ConclusionSheetPane";
import type { SheetContext } from "../../components/conclusion-forms/FormSheet";
import type { ConclusionPDFData } from "../../utility/pdfGenerator";
import { formatPatientAge } from "../../utility/age";
import { subtleBg } from "../../theme";
import { ConclusionHistory } from "../../components/conclusion-forms/ConclusionHistory";
import { ConclusionFormReadView } from "../../components/conclusion-forms/ConclusionFormReadView";
import { PatientConclusionHistoryPanel } from "../../components/conclusion-forms/PatientConclusionHistoryPanel";
import { buildConclusionPrintParts, formatDiagnoses } from "../../utility/conclusionPrintParts";
import {
  AiAssistHeaderButton,
  AiAssistPendingStrip,
  AiAssistSuggestion,
  AiGutterPult,
  AiSuggestionBeside,
} from "../../components/conclusion-forms/AiAssistControls";
import {
  AiSuggestionGutter,
  AI_GUTTER_PAD_LEFT,
  AI_GUTTER_PAD_RIGHT,
  AI_GUTTER_WIDTH,
  type AiGutterMode,
  type AiGutterUndo,
  type AiSuggestionGutterHandle,
} from "../../components/conclusion-forms/AiSuggestionGutter";
import { useAiFieldMarks } from "../../components/conclusion-forms/aiFieldMarks";
import { AiThinkingOverlay, AiThinkingStrip } from "../../components/conclusion-forms/AiThinkingStrip";
import { aiCardIn, aiFieldGlow, reducedMotion } from "../../components/ai/aiMotion";
import {
  AiReviewDialog,
  type AiReviewEntry,
  type AiReviewTarget,
} from "../../components/conclusion-forms/AiReviewDialog";
import {
  aiRowKey,
  useAiAssist,
  type AiAssistKey,
} from "../../components/conclusion-forms/useAiAssist";
import { CollapsibleTextField } from "../../components/conclusion-forms/CollapsibleTextField";
import { useCan } from "../../hooks/useCan";
import {
  clearConclusionDraft,
  conclusionDraftId,
  readConclusionDraft,
  targetField,
  writeConclusionDraft,
  type ConclusionDraftBody,
} from "../../components/conclusion-forms/conclusionDraftStorage";
import { VitalStepper } from "../../components/conclusion-forms/VitalStepper";
import {
  HEIGHT_DECIMALS,
  TEMPERATURE_DECIMALS,
  WEIGHT_DECIMALS,
  validateVitals,
} from "../../components/conclusion-forms/conclusionVitals";
import {
  diagnosesAsText,
  resolveDiagnosesFromText,
} from "../../utility/conclusionAiDiagnosis";
import {
  getConclusionForms,
  renderFilledForm,
  fieldCaption,
  resolveFormForScope,
  stripLeadingBlankLines,
  type ConclusionFormTemplate,
  type FormFieldSlot,
  type FormTarget,
} from "../../api/conclusionForms";
import {
  buildConclusionFormData,
  fitConclusionFormData,
  parseConclusionFormData,
  type ParsedConclusionForm,
} from "../../api/conclusionFormData";
import {
  PRESET_COLUMNS,
  frequentDiagnoses,
  historyDiagnoses,
  mergeManual,
  planPresetTexts,
  presetFormValues,
  summarizeProgress,
  type PresetTexts,
  type ProgressRow,
} from "../../components/conclusion-forms/conclusionPresets";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";

import {
  upsertConclusion,
  createAdditionalConclusion,
  updateConclusion,
  getConclusionSlots,
  getConclusionContext,
  getMedicalConclusion,
  getPatientConclusions,
  findReplacementSlot,
  isServiceLineGoneError,
  getDiagnoses,
  getFrequentDiagnoses,
  uploadConclusionPhoto,
  getConclusionTemplates,
  createConclusionTemplate,
  deleteConclusionTemplate,
  parseBackendError,
  type MedicalConclusion,
  type MedicalConclusionPayload,
  type ConclusionStatus,
  type CatalogDiagnosis,
  type ConclusionTemplate,
  type PatientConclusionSummary,
  type AiAssistField,
} from "../../api/medical";

// ── types ──────────────────────────────────────────────────────────────────────

export type DjangoConclusionDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** null = creating new via upsert (or a new document, see createAsNew) */
  conclusion: MedicalConclusion | null;
  serviceLineId: number;
  /**
   * Новое заключение — ещё один документ строки, а не первое. Сохраняется
   * через `POST …/conclusions/` (всегда создаёт); upsert переписал бы первый
   * документ — ровно та потеря бланка приёма, на которую жаловалась клиника
   * 22.09.2026, когда следом открывали УЗИ.
   */
  createAsNew?: boolean;
  /**
   * Черновик в localStorage живёт по строке услуги. Документов у строки может
   * быть несколько, и без различителя черновик УЗИ ложился бы в карту осмотра.
   * Первый документ идёт без него — так не теряются черновики, начатые до
   * появления нескольких документов.
   */
  draftScope?: string;
  /** Переключатель документов строки — под шапкой (см. DjangoConclusionSlotsPanel). */
  documentBar?: React.ReactNode;
  serviceName: string;
  /**
   * Услуга строки. Нужна, чтобы найти строку заново, если её пересоздали
   * правкой приёма, пока форма была открыта (см. handleSave).
   */
  serviceId?: number | null;
  doctorName: string;
  /** Приём, к которому относится строка услуги — нужен бланкам (шапка листа). */
  appointmentId?: number;
  /**
   * Филиал приёма. По нему бэк режет список бланков (бланки филиала + общие) и
   * подбирается бланк по умолчанию. Не передан — берём филиал сессии: врач
   * работает там, куда переключён, и печатает на его форме.
   */
  branchId?: number | null;
  /** Врач строки услуги: по его специализациям подбираются бланки. */
  doctorId?: number | null;
  canEdit: boolean;
  canPrint: boolean;
  /** Patient's complaints from the appointment (read-only context block). */
  patientComplaints?: string | null;
  /** Встроенный режим: рендер прямо в колонке (без Drawer-обёртки), как в
   *  оригинале — заключение видно сразу в третьей колонке. */
  inline?: boolean;
  /** Кнопка «Изменить заключение» в шапке (в inline-просмотре). */
  onStartEdit?: () => void;
  onSaved?: (saved: MedicalConclusion) => void;
};

/** Подпись зоны формы: «Показатели», «Протокол», «Служебное». */
const SECTION_TITLE_SX = {
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "text.secondary",
} as const;

/** Стабильная пустышка: `?? {}` на каждом рендере дёргал бы превью листа. */
const EMPTY_VALUES: Record<string, string> = {};

/** Колонка формы, когда справа от неё стоит лист, — прежняя ширина дровера. */
const FORM_COLUMN_WIDTH = 560;
/** Ширина дровера без листа на ноутбуке и шире (md). */
const DRAWER_WIDTH_MD = 560;
/** Предел ширины дровера с листом рядом. */
const SHEET_DRAWER_MAX_WIDTH = 1200;

// ── лист рядом с формой: выбор врача помним в браузере ─────────────────────────
// По умолчанию лист скрыт (30.09.2026): форма важнее. Кто его открыл —
// тому он нужен и при следующем открытии.
const SHEET_PREF_KEY = "mamadoc:conclusion-sheet";

function readSheetPref(): boolean {
  try {
    return window.localStorage.getItem(SHEET_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSheetPref(visible: boolean) {
  try {
    window.localStorage.setItem(SHEET_PREF_KEY, visible ? "1" : "0");
  } catch {
    /* localStorage недоступен — выбор проживёт до закрытия вкладки */
  }
}

// ── Знакомство с предварительным просмотром: показываем один раз ───────────────
const PREVIEW_COACH_KEY = "mamadoc:conclusion-preview-coach-seen";

function readPreviewCoachSeen(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_COACH_KEY) === "1";
  } catch {
    // Хранилище недоступно — не показываем: иначе плашка вылезала бы каждый раз.
    return true;
  }
}

function writePreviewCoachSeen() {
  try {
    window.localStorage.setItem(PREVIEW_COACH_KEY, "1");
  } catch {
    /* localStorage недоступен — плашка просто не вернётся до перезагрузки */
  }
}

// ── «Частые у вас»: личный выбор врача, помним в браузере ──────────────────────
// По умолчанию выключено (01.10.2026): части врачей строка мешала. Кому нужна —
// включает звёздочкой у поля диагноза. Хранить в профиле бэк пока не умеет.
const FREQUENT_DX_PREF_KEY = "mamadoc:conclusion-frequent-dx";

function readFrequentDxPref(): boolean {
  try {
    return window.localStorage.getItem(FREQUENT_DX_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFrequentDxPref(enabled: boolean) {
  try {
    window.localStorage.setItem(FREQUENT_DX_PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* localStorage недоступен — выбор проживёт до закрытия вкладки */
  }
}

// ── component ──────────────────────────────────────────────────────────────────

const DjangoConclusionDrawer: React.FC<DjangoConclusionDrawerProps> = ({
  open,
  onClose,
  conclusion,
  serviceLineId,
  createAsNew = false,
  draftScope,
  documentBar,
  serviceName,
  serviceId,
  doctorName,
  appointmentId,
  branchId,
  doctorId,
  canEdit,
  canPrint,
  patientComplaints,
  inline = false,
  onStartEdit,
  onSaved,
}) => {
  const { t, term } = useT("appointments");
  const { open: notify } = useNotification();
  // Черновик и гидратация — по документу: у строки их может быть несколько.
  const draftId = conclusionDraftId(serviceLineId, draftScope);
  const theme = useTheme();
  // Телефон: шапка и кнопки формы ужимаются, иначе на ввод остаётся полоска.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  // Выпадающие списки рисуются в портале и о клавиатуре не знают: список
  // диагнозов открывался вниз на 338px и наполовину уходил под неё. Отсюда
  // берём и границу для popper, и потолок высоты списка.
  const keyboard = useKeyboardViewportHeight(isMobile);
  // Отступ, ниже которого popper заезжает под клавиатуру.
  const popperPadding = keyboard.keyboardOpen
    ? { bottom: keyboard.keyboardInset + 8 }
    : undefined;
  // Список короче экрана над клавиатурой — иначе он не «влезет вверх» и
  // popper всё равно откроется вниз.
  const listboxMaxHeight = keyboard.keyboardOpen
    ? Math.max(132, Math.round(keyboard.availableHeight * 0.45))
    : undefined;

  // ── form state ────────────────────────────────────────────────────────────
  const [complaints, setComplaints] = React.useState("");
  const [anamnesis, setAnamnesis] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [conclusionText, setConclusionText] = React.useState("");
  const [selectedDiagnoses, setSelectedDiagnoses] = React.useState<
    CatalogDiagnosis[]
  >([]);
  const [catalog, setCatalog] = React.useState<CatalogDiagnosis[]>([]);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [catalogError, setCatalogError] = React.useState(false);
  // Текст, введённый в поле диагноза — уходит на сервер как search (debounce).
  const [diagInput, setDiagInput] = React.useState("");
  const [photoUrls, setPhotoUrls] = React.useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [previewPhoto, setPreviewPhoto] = React.useState<string | null>(null);
  // Templates
  const [templates, setTemplates] = React.useState<ConclusionTemplate[]>([]);
  const [saveTplOpen, setSaveTplOpen] = React.useState(false);
  const [tplName, setTplName] = React.useState("");
  const [tplBusy, setTplBusy] = React.useState(false);
  // Бланки: конструктор печатных форм (Настройки → Бланки заключений).
  // Прикреплённый бланк и значения его полей — поля стоят прямо в дровере, а
  // целевое текстовое поле собирается из них (см. ConclusionFormInline).
  const [formId, setFormId] = React.useState<number | null>(null);
  const [formValues, setFormValues] = React.useState<Record<string, string>>({});
  /**
   * Шаблон, по которому заключение уже заполняли (снапшот из `formData`).
   *
   * Сохранённое заключение открывается именно по нему, а не по актуальному
   * бланку из настроек: администратор мог переставить поля, переименовать
   * строки или переназначить привязку к колонке — тогда значения легли бы не в
   * свои строки. Врач выбрал другой бланк — снапшот сбрасывается.
   */
  const [formSnapshot, setFormSnapshot] =
    React.useState<ConclusionFormTemplate | null>(null);
  /**
   * Свободный хвост бланка: вывод и рекомендации, которых в строках нет.
   * Держим отдельно от собранного текста — иначе его пришлось бы вырезать из
   * проекции при каждой правке значений.
   */
  const [manualText, setManualText] = React.useState("");
  /** Итог, собранный бланком, по умолчанию свёрнут: он дублирует поля выше. */
  const [projectionOpen, setProjectionOpen] = React.useState(false);
  /** Черновик принёс свой выбор бланка — дефолт его не перебивает. */
  const restoredWithFormRef = React.useRef(false);
  const [weightKg, setWeightKg] = React.useState("");
  const [heightCm, setHeightCm] = React.useState("");
  const [temperature, setTemperature] = React.useState("");
  const [internalComment, setInternalComment] = React.useState("");
  const [status, setStatus] = React.useState<ConclusionStatus>("draft");

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const readOnly = !canEdit;
  const canViewPatientHistory = useCan("medical.conclusions.view");
  const [patientHistoryOpen, setPatientHistoryOpen] = React.useState(false);
  const historySide = !inline && !isMobile;
  const showHistorySide = patientHistoryOpen && historySide;
  const showHistoryTab = patientHistoryOpen && !historySide;
  React.useEffect(() => {
    setPatientHistoryOpen(false);
  }, [open, appointmentId, canViewPatientHistory]);

  // ── лист рядом с формой (редизайн 28.09.2026) ─────────────────────────────
  // Справа от формы лист встаёт только в дровере на широком экране. В колонке
  // приёма (inline) и на телефоне места под две колонки нет: там лист
  // открывается вместо формы кнопкой «Лист» и закрывается ею же.
  const isWide = useMediaQuery(theme.breakpoints.up("lg"));
  const sheetSide = !inline && isWide;
  const [sheetPinned, setSheetPinned] = React.useState(readSheetPref);
  const [sheetTab, setSheetTab] = React.useState(false);
  // Лист есть и в просмотре: там это и есть документ, каким его напечатают.
  const showSheetSide = sheetSide && sheetPinned && !patientHistoryOpen;
  const showSheetTab = !sheetSide && sheetTab && !patientHistoryOpen;
  // Подсказки AI — слева от дровера, напротив полей; дровер не расширяется.
  // Широкий экран — «Зеркало» (карточка шириной с поле), поуже — «Фокус»
  // (метки у полей и одна раскрытая подсказка), ещё уже — плашки над полями.
  const gutterQuery = (mode: AiGutterMode, drawerWidth: number) =>
    `(min-width: ${drawerWidth + AI_GUTTER_WIDTH[mode] + 48}px)`;
  const mirrorRoom = useMediaQuery(gutterQuery("mirror", DRAWER_WIDTH_MD));
  const mirrorRoomWithSheet = useMediaQuery(gutterQuery("mirror", SHEET_DRAWER_MAX_WIDTH));
  const focusRoom = useMediaQuery(gutterQuery("focus", DRAWER_WIDTH_MD));
  const focusRoomWithSheet = useMediaQuery(gutterQuery("focus", SHEET_DRAWER_MAX_WIDTH));
  const aiGutterMode: AiGutterMode | null =
    inline || patientHistoryOpen
    ? null
    : (showSheetSide ? mirrorRoomWithSheet : mirrorRoom)
      ? "mirror"
      : (showSheetSide ? focusRoomWithSheet : focusRoom)
        ? "focus"
        : null;
  const aiGutterFits = aiGutterMode != null;
  /**
   * Кнопка предварительного просмотра — иконка, и врачи её не находили.
   * При первом открытии формы один раз показываем плашку-знакомство со
   * стрелкой на кнопку; «Понятно» или нажатие самой кнопки её убирают.
   */
  const [sheetButtonEl, setSheetButtonEl] = React.useState<HTMLElement | null>(null);
  const [previewCoachSeen, setPreviewCoachSeen] = React.useState(readPreviewCoachSeen);
  const [previewCoachReady, setPreviewCoachReady] = React.useState(false);
  React.useEffect(() => {
    if (!open || previewCoachSeen) return;
    // Дровер ещё выезжает — плашка встаёт, когда кнопка на месте.
    const timer = window.setTimeout(() => setPreviewCoachReady(true), 700);
    return () => window.clearTimeout(timer);
  }, [open, previewCoachSeen]);
  const dismissPreviewCoach = () => {
    if (previewCoachSeen) return;
    writePreviewCoachSeen();
    setPreviewCoachSeen(true);
  };
  const showPreviewCoach = open && !previewCoachSeen && previewCoachReady && sheetButtonEl != null;

  const toggleSheet = () => {
    setPatientHistoryOpen(false);
    if (sheetSide) {
      setSheetPinned((prev) => {
        writeSheetPref(!prev);
        return !prev;
      });
    } else {
      setSheetTab((prev) => !prev);
    }
  };
  // «Изменить» из просмотра открывает форму, а не лист, оставшийся от
  // просмотра: врач пришёл править, а не смотреть.
  React.useEffect(() => {
    if (!readOnly) setSheetTab(false);
  }, [readOnly]);
  /** Строка формы в фокусе — её строка подсвечивается на листе. */
  const [focusedRow, setFocusedRow] = React.useState<string | null>(null);
  /** «Служебное» раскрыто кнопкой, пока в нём ещё ничего нет. */
  const [serviceOpen, setServiceOpen] = React.useState(false);
  /** Когда черновик последний раз лёг в localStorage — для строки в футере. */
  const [draftSavedAt, setDraftSavedAt] = React.useState<string | null>(null);
  const formColumnRef = React.useRef<HTMLDivElement | null>(null);

  // ── AI-помощник ───────────────────────────────────────────────────────────
  // Кнопку видит только тот, кто может создавать заключения: без права бэк
  // ответит 403 (гайд §4), и показывать кнопку, которая всегда падает, нельзя.
  // «Чужой приём» закрывает readOnly — слот отдаёт canEdit по исполнителю.
  const canAiAssist = useCan("medical.conclusions.create") && !readOnly;
  const ai = useAiAssist({
    serviceLineId,
    // Один тост на нажатие: когда подсказок нет совсем (в поле, где модели
    // нечего сказать, плашки просто нет) или поток оборвался на середине —
    // пришедшие карточки остаются, по остальным полям AI не ответил.
    onSettled: ({ suggested, empty, unchanged, unavailable, failed }) => {
      if (suggested > 0) {
        if (unavailable > 0) {
          notify?.({ type: "error", message: t("conclusion.aiAssist.partial", { count: unavailable }) });
        }
        return;
      }
      if (unavailable > 0) {
        notify?.({ type: "error", message: t("conclusion.aiAssist.unavailable") });
      } else if (failed > 0) {
        notify?.({ type: "error", message: t("conclusion.aiAssist.failed") });
      } else if (unchanged > 0 && empty === 0) {
        // Текст уже хорош — это не «мало данных», а хороший итог.
        notify?.({ type: "progress", message: t("conclusion.aiAssist.unchanged") });
      } else {
        notify?.({ type: "progress", message: t("conclusion.aiAssist.empty") });
      }
    },
  });
  // Предложения принадлежат открытой строке: при смене строки или закрытии
  // дровера старый ответ модели не должен всплыть над другим заключением.
  /** Очередь режима проверки, замороженная при открытии; null — окно закрыто. */
  const [aiReview, setAiReview] = React.useState<AiReviewEntry[] | null>(null);
  /** Последнее решение по подсказке — «Вернуть» у поля и ⌘Z, 12 секунд. */
  const [aiUndo, setAiUndo] = React.useState<AiGutterUndo | null>(null);
  React.useEffect(() => {
    if (!aiUndo) return;
    const timer = window.setTimeout(() => setAiUndo(null), 12000);
    return () => window.clearTimeout(timer);
  }, [aiUndo]);
  const aiGutterRef = React.useRef<AiSuggestionGutterHandle | null>(null);
  React.useEffect(() => {
    ai.reset();
    setAiReview(null);
    setAiUndo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId]);

  /**
   * Блок-подсказку «жалобы при регистрации» показываем только когда врач
   * изменил перенесённый текст. Пока текст совпадает слово в слово, блок
   * дублировал бы поле ниже; как только врач переписал жалобы по-своему,
   * первичная запись снова становится полезной — видно, с чем пришёл пациент.
   */
  const patientComplaintsText = (patientComplaints ?? "").trim();
  const showPatientComplaints =
    patientComplaintsText.length > 0 && patientComplaintsText !== complaints.trim();

  // Локальный черновик: hydratedRef — форма заполнена (можно писать черновик),
  // baselineRef — снимок формы на момент открытия (не пишем, пока нет правок),
  // draftNotifiedRef — уведомление о восстановлении показываем один раз.
  const hydratedRef = React.useRef(false);
  const baselineRef = React.useRef("");
  const draftNotifiedRef = React.useRef(false);
  // Последние правки, ещё не записанные отложенным таймером, — дописываются
  // при закрытии/размонтировании, чтобы не потерять хвост ввода.
  const pendingDraftRef = React.useRef<ConclusionDraftBody | null>(null);

  const applyDraftBody = (body: ConclusionDraftBody) => {
    setComplaints(body.complaints ?? "");
    setAnamnesis(body.anamnesis ?? "");
    setObjective(body.objective ?? "");
    setConclusionText(body.conclusionText ?? "");
    setSelectedDiagnoses(body.selectedDiagnoses ?? []);
    setPhotoUrls(body.photoUrls ?? []);
    setWeightKg(body.weightKg ?? "");
    setHeightCm(body.heightCm ?? "");
    setTemperature(body.temperature ?? "");
    setInternalComment(body.internalComment ?? "");
    setStatus(body.status ?? "draft");
    setFormId(body.formId ?? null);
    setFormValues(body.formValues ?? {});
    setManualText(body.formManual ?? "");
    setFormSnapshot(body.formSnapshot ?? null);
  };

  // Ключ гидратации. Пересобирать форму нужно при открытии, смене строки услуги,
  // переключении просмотр↔правка и при появлении НОВЫХ серверных данных — но не
  // на каждый новый объект `conclusion` из react-query и не на каждую подгрузку
  // каталога МКБ-10. Раньше `catalog` и сам объект стояли в зависимостях, и
  // любой поиск диагноза (или рефетч слотов) посреди заполнения молча затирал
  // форму — первыми страдали вес и рост, их вбивают в первые секунды.
  const hydrationKey = [
    open ? "open" : "closed",
    readOnly ? "ro" : "rw",
    draftId,
    conclusion?.id ?? 0,
    conclusion?.updatedAt ?? "",
  ].join("|");

  // ── populate from existing conclusion / local draft ───────────────────────
  React.useEffect(() => {
    if (!open) {
      // Закрыли до срабатывания отложенной записи — дописываем черновик.
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(draftId, pendingDraftRef.current);
      }
      pendingDraftRef.current = null;
      applyDraftBody({
        complaints: "",
        anamnesis: "",
        objective: "",
        conclusionText: "",
        selectedDiagnoses: [],
        photoUrls: [],
        weightKg: "",
        heightCm: "",
        temperature: "",
        internalComment: "",
        status: "draft",
      });
      vitals.reset();
      completion.reset();
      setSaving(false);
      setSaveError(null);
      setSheetTab(false);
      setServiceOpen(false);
      setFocusedRow(null);
      setDraftSavedAt(null);
      hydratedRef.current = false;
      draftNotifiedRef.current = false;
      return;
    }

    // Несохранённый черновик из localStorage приоритетнее серверных данных,
    // если он свежее последнего сохранения на сервере.
    const draft = readOnly ? null : readConclusionDraft(draftId);
    const draftIsFresh =
      !!draft &&
      (!conclusion?.updatedAt ||
        !draft.savedAt ||
        dayjs(draft.savedAt).isAfter(dayjs(conclusion.updatedAt)));
    if (draft && !draftIsFresh) clearConclusionDraft(draftId);

    if (draft && draftIsFresh) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { savedAt: _savedAt, ...body } = draft;
      applyDraftBody(body);
      baselineRef.current = JSON.stringify(body);
      hydratedRef.current = true;
      setDraftSavedAt(draft.savedAt ?? null);
      // Черновик несёт свой выбор бланка (в том числе сознательное «без
      // бланка») — дефолт по правилам его не перебивает.
      restoredWithFormRef.current = true;
      if (!draftNotifiedRef.current) {
        draftNotifiedRef.current = true;
        notify?.({
          type: "success",
          message: t("conclusion.draftRestored"),
        });
      }
      return;
    }

    // Заполненный бланк сохранённого заключения: значения полей, ручной хвост
    // и снапшот шаблона, по которому его и заполняли (api/conclusionFormData).
    const savedForm = conclusion ? parseConclusionFormData(conclusion.formData) : null;

    // Restore selected diagnoses from saved diagnosisData (match against
    // catalog by code when possible; keep a synthetic item otherwise).
    const body: ConclusionDraftBody = conclusion
      ? {
          complaints: conclusion.complaints ?? "",
          anamnesis: conclusion.anamnesis ?? "",
          objective: conclusion.objective ?? "",
          conclusionText: conclusion.conclusion ?? "",
          selectedDiagnoses: (conclusion.diagnosisData ?? []).map((d) => {
            const fromCatalog = catalog.find((c) => c.code === d.diagnosisCode);
            return (
              fromCatalog ?? {
                id: d.id ? Number(d.id) : -1,
                code: d.diagnosisCode ?? "",
                title: d.title ?? "",
                displayName: d.displayName ?? "",
                isActive: true,
                sortOrder: 0,
              }
            );
          }),
          photoUrls: conclusion.photoUrls ?? [],
          // Бэк хранит decimal и отдаёт «5.50»/«114.00» — в поле и в подпись
          // это должно попадать как «5.5»/«114».
          weightKg: trimDecimalInput(conclusion.weightKg),
          heightCm: trimDecimalInput(conclusion.heightCm),
          temperature: trimDecimalInput(conclusion.temperature),
          internalComment: conclusion.internalComment ?? "",
          status: conclusion.status ?? "draft",
          // Бланк заключения приходит с сервера в `formData`: врач видит те же
          // строки протокола, что заполнял, а не собранный из них текст.
          formId: savedForm?.formId ?? null,
          // Пустые строки в начале — перенос из нормы поля (см.
          // stripLeadingBlankLines); в старых заключениях он сохранён вместе
          // со значением. Чистим до baseline, чтобы это не считалось правкой.
          formValues: Object.fromEntries(
            Object.entries(savedForm?.values ?? {}).map(([id, value]) => [
              id,
              stripLeadingBlankLines(value),
            ]),
          ),
          formManual: savedForm?.manual ?? "",
          formSnapshot: savedForm?.snapshot ?? null,
        }
      : {
          // Жалобы, записанные при регистрации, переносим в поле сразу: врач
          // перепечатывал их руками с блока-подсказки выше, хотя это тот же
          // текст. Дальше поле его — правки и стирание остаются как есть, и
          // перенос в baseline попадает вместе со всем телом, поэтому просто
          // открытое заключение по-прежнему не создаёт черновик.
          complaints: patientComplaints?.trim() ? patientComplaints : "",
          anamnesis: "",
          objective: "",
          conclusionText: "",
          selectedDiagnoses: [],
          photoUrls: [],
          weightKg: "",
          heightCm: "",
          temperature: "",
          internalComment: "",
          status: "draft",
          // Бланк прикрепляется отдельным эффектом ниже: список бланков
          // приходит с сервера позже гидратации.
          formId: null,
          formValues: {},
          formManual: "",
          formSnapshot: null,
        };
    applyDraftBody(body);
    baselineRef.current = JSON.stringify(body);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationKey]);

  // ── бланк по умолчанию для НОВОГО заключения ──────────────────────────────
  // Заполненный бланк и есть тело заключения, поэтому у нового заключения он
  // должен быть уже раскрыт: врач дописывает значения по строкам протокола, а
  // не начинает с пустого поля и не ищет нужный бланк в списке.
  //
  // Какой именно бланк — решают привязки самого бланка (`serviceIds`,
  // `branchIds`, `isDefault`, см. resolveFormForScope): заключение привязано к
  // строке услуги, и это единственный ключ, который на живых данных заполнен —
  // специализацию сотруднику PATCH-ем не назначить. Филиал берём у приёма,
  // если он известен, иначе — из сессии: врач работает там, куда переключён.
  const defaultsOrgId = useApiOrgId();
  const { activeBranch, activeOrganization } = usePermissions();
  const scopeBranchId = branchId ?? activeBranch?.id ?? null;
  // Бланки нужны и для подстановки, и для селекта в секции полей, поэтому
  // грузим их всегда, пока дровер открыт на правку.
  // В просмотре список нужен листу: у старых заключений в formData нет
  // снапшота, и бланк листа берётся из выдачи по formId.
  const formsEnabled = open && (!readOnly || showSheetSide || showSheetTab);

  const formsQuery = useQuery({
    queryKey: djangoQueryKeys.conclusionForms.list(defaultsOrgId ?? null, scopeBranchId),
    // Филиал режет выдачу на бэке: приходят бланки этого филиала и общие.
    queryFn: ({ signal }) =>
      getConclusionForms(defaultsOrgId, signal, { branchId: scopeBranchId }),
    enabled: formsEnabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });
  // useMemo, а не `?? []`: новый пустой массив на каждом рендере пересчитывал
  // бы мемо ниже и дёргал эффекты секции бланка.
  const availableForms = React.useMemo(() => formsQuery.data ?? [], [formsQuery.data]);

  /** Бланк, положенный привязками именно этому заключению. */
  const defaultForm: ConclusionFormTemplate | null = React.useMemo(() => {
    if (!formsEnabled || conclusion) return null;
    if (availableForms.length === 0) return null;
    return resolveFormForScope(availableForms, {
      branchId: scopeBranchId,
      serviceId: serviceId ?? null,
    });
  }, [formsEnabled, conclusion, availableForms, scopeBranchId, serviceId]);

  /**
   * Бланк, по которому рисуются поля и печатный лист.
   *
   * Снапшот из `formData` важнее актуального шаблона: заключение заполняли по
   * той версии бланка, и порядок полей, подписи и привязки к колонкам должны
   * остаться теми же, даже если администратор с тех пор переделал бланк.
   */
  const attachedForm = React.useMemo(() => {
    if (formSnapshot && formSnapshot.id === formId) return formSnapshot;
    return availableForms.find((form) => form.id === formId) ?? null;
  }, [availableForms, formId, formSnapshot]);

  /**
   * Список для селекта бланков. Прикреплённый бланк добавляем, даже если его
   * нет в выдаче: заключение могли заполнить по бланку, который потом
   * выключили, удалили или закрепили за другим филиалом, — селект без него
   * показал бы пустое поле над заполненными строками.
   */
  const selectableForms = React.useMemo(
    () =>
      attachedForm && !availableForms.some((form) => form.id === attachedForm.id)
        ? [attachedForm, ...availableForms]
        : availableForms,
    [attachedForm, availableForms],
  );

  /** Значения по умолчанию бланка — то, что уже стоит в его строках как норма. */
  const formDefaults = React.useCallback(
    (form: ConclusionFormTemplate) =>
      Object.fromEntries(
        form.fields.map((field) => [field.id, stripLeadingBlankLines(field.defaultValue ?? "")]),
      ),
    [],
  );

  // Прикрепление дефолтного бланка. Ждём гидратацию: иначе поля легли бы в
  // форму до того, как её перезапишет пустое тело нового заключения.
  const attachedForLineRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!defaultForm || !hydratedRef.current) return;
    if (attachedForLineRef.current === draftId) return;
    attachedForLineRef.current = draftId;
    // Восстановленный черновик уже несёт свой бланк (или сознательно ни один)
    // — не перебиваем его дефолтом.
    if (formId != null || restoredWithFormRef.current) return;

    const defaults = formDefaults(defaultForm);
    setFormId(defaultForm.id);
    setFormValues(defaults);
    dropPrefilledComplaints(defaultForm);

    // Прикрепление и нормы — не правка врача: без этого автосейв счёл бы их
    // изменением и создавал черновик на каждом просто открытом заключении.
    // Снятый перенос жалоб — тоже не правка.
    try {
      const baseline = JSON.parse(baselineRef.current) as ConclusionDraftBody;
      const complaintsDropped =
        !defaultForm.fields.some((field) => field.slot === "complaints") &&
        patientComplaintsText !== "" &&
        (baseline.complaints ?? "").trim() === patientComplaintsText;
      baselineRef.current = JSON.stringify({
        ...baseline,
        ...(complaintsDropped ? { complaints: "" } : {}),
        formId: defaultForm.id,
        formValues: defaults,
        [targetField(defaultForm.target)]: renderFilledForm(defaultForm, defaults),
      });
    } catch {
      /* baseline ещё не собран — следующая гидратация его перезапишет */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultForm, draftId, hydrationKey]);

  // Закрыли дровер — метку снимаем: следующее открытие снова подставит бланк.
  React.useEffect(() => {
    if (!open) {
      attachedForLineRef.current = null;
      restoredWithFormRef.current = false;
      detachedFormRef.current = null;
    }
  }, [open]);

  /**
   * Целевое поле — проекция значений бланка, а не свободный текст: пока бланк
   * прикреплён, поле собирается заново на каждое изменение и руками не
   * правится (иначе правку пришлось бы разбирать обратно в поля — а разбор
   * текста врёт на любой вольности врача).
   */
  React.useEffect(() => {
    if (!attachedForm || readOnly) return;
    // Привязанные к колонкам поля renderFilledForm пропускает сам — в тексте
    // они задвоились бы с собственной колонкой. Хвост дописываем последним.
    const body = renderFilledForm(attachedForm, formValues);
    const tail = manualText.trim();
    const text = [body, tail].filter(Boolean).join("\n\n");
    if (attachedForm.target === "anamnesis") setAnamnesis(text);
    else if (attachedForm.target === "objective") setObjective(text);
    else setConclusionText(text);
  }, [attachedForm, formValues, manualText, readOnly]);

  /** Колонки заключения, которыми управляет прикреплённый бланк. */
  const attachedSlots = React.useMemo(() => {
    const set = new Set<FormFieldSlot>();
    for (const field of attachedForm?.fields ?? []) if (field.slot) set.add(field.slot);
    return set;
  }, [attachedForm]);

  /**
   * Просмотр заключения по бланку раскладывается так же, как печать: строки
   * листа плюс колонки, которых на листе нет (см. ConclusionFormReadView).
   * Одно правило на экран и бумагу — иначе они снова разъедутся.
   */
  const formParts = React.useMemo(() => {
    if (!attachedForm) return null;
    const quantity = (value: string) => (value.trim() ? formatQuantity(value) : "");
    return buildConclusionPrintParts({
      template: attachedForm,
      formValues,
      manual: manualText,
      columns: {
        heightCm: quantity(heightCm),
        weightKg: quantity(weightKg),
        temperature: quantity(temperature),
        complaints,
        diagnosis: formatDiagnoses(
          selectedDiagnoses.map((d) => ({
            diagnosisCode: d.code,
            title: d.title,
            displayName: d.displayName,
          })),
        ),
        anamnesis,
        objective,
        conclusion: conclusionText,
      },
    });
  }, [
    attachedForm,
    formValues,
    manualText,
    heightCm,
    weightKg,
    temperature,
    complaints,
    selectedDiagnoses,
    anamnesis,
    objective,
    conclusionText,
  ]);
  const readOnlyFormParts = readOnly ? formParts : null;

  // ── шапка и лист: пациент и время приёма ──────────────────────────────────
  // Та же ручка, что у печати (conclusion-context): карточка приёма врачу без
  // «видеть все приёмы» на приём коллеги отвечает 404.
  const contextQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.conclusionContext(appointmentId ?? 0),
    queryFn: ({ signal }) => getConclusionContext(appointmentId as number, signal),
    enabled: open && appointmentId != null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });
  const visitContext = contextQuery.data ?? null;
  const patientName = visitContext?.patient?.fullName ?? "";
  const patientAge = formatPatientAge(visitContext?.patient?.birthDate);
  const visitDateTime = visitContext?.startsAt
    ? dayjs(visitContext.startsAt).format("DD.MM.YYYY HH:mm")
    : "";

  // ── история пациента: «как в прошлый раз» и диагнозы прошлых визитов ──────
  const historyPatientId = visitContext?.patient?.id ?? null;
  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.patients.conclusions(historyPatientId ?? 0),
    queryFn: ({ signal }) => getPatientConclusions(historyPatientId as number, signal),
    enabled: open && !readOnly && historyPatientId != null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });
  /** Прошлые заключения без открытого сейчас — от новых к старым. */
  const patientHistory = React.useMemo(
    () => (historyQuery.data ?? []).filter((item) => item.id !== conclusion?.id),
    [historyQuery.data, conclusion?.id],
  );
  /** В меню «как в прошлый раз» — только завершённые: черновик мог быть брошен. */
  const previousConclusions = React.useMemo(
    () => patientHistory.filter((item) => item.status === "completed").slice(0, 5),
    [patientHistory],
  );
  const historyDx = historyDiagnoses(
    patientHistory,
    selectedDiagnoses.map((d) => d.code),
  );

  // «Частые у вас» — топ кодов врача по его заключениям. Считает бэк по
  // текущему пользователю; без карточки сотрудника ответ пустой. Запрос идёт,
  // только если врач включил строку.
  const [frequentOn, setFrequentOn] = React.useState(readFrequentDxPref);
  const toggleFrequent = () =>
    setFrequentOn((prev) => {
      writeFrequentDxPref(!prev);
      return !prev;
    });
  const frequentQuery = useQuery({
    queryKey: djangoQueryKeys.diagnoses.frequent(defaultsOrgId),
    queryFn: ({ signal }) => getFrequentDiagnoses({}, signal),
    enabled: open && !readOnly && frequentOn,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });
  const frequentDx = frequentDiagnoses(frequentQuery.data ?? [], [
    ...selectedDiagnoses.map((d) => d.code),
    ...historyDx.map((d) => d.code),
  ]);
  /** Ответ пришёл, а показать нечего: подсказка, чтобы не казалось сломанным. */
  const frequentEmpty =
    frequentQuery.isSuccess && (frequentQuery.data ?? []).length === 0;

  /** Чип «добавить диагноз в один клик» — общий для истории и частых. */
  const quickDiagnosisChip = (
    dx: { code: string; title: string },
    hint: string,
    diagnosis: CatalogDiagnosis,
  ) => (
    <Chip
      key={dx.code}
      size="small"
      variant="outlined"
      icon={<AddOutlined />}
      label={dx.title ? `${dx.code} ${dx.title}` : dx.code}
      title={hint}
      onClick={() => setSelectedDiagnoses((prev) => [...prev, diagnosis])}
      sx={{ maxWidth: "100%" }}
    />
  );

  const sheetContext: SheetContext = {
    patientFio: patientName || "—",
    patientDob: visitContext?.patient?.birthDate
      ? dayjs(visitContext.patient.birthDate).format("DD.MM.YYYY")
      : "—",
    appointmentDateTime: visitDateTime || "—",
    doctorFio: doctorName,
    clinicName: activeOrganization?.name ?? "",
    clinicLogoUrl: activeOrganization?.logoUrl,
  };

  /**
   * Бланк листа. Строки — из того, по чему заполняют (снапшот или шаблон), а
   * фирменная бумага — актуальная: так же решает печать (resolveTemplate в
   * ConclusionPrintPage), иначе экран показал бы старую подложку и отступы.
   */
  const sheetTemplate = React.useMemo(() => {
    if (!attachedForm) return null;
    const current = availableForms.find((form) => form.id === attachedForm.id);
    if (!current || current === attachedForm) return attachedForm;
    return {
      ...attachedForm,
      background: current.background,
      margins: current.margins,
      showClinicHeader: current.showClinicHeader,
      headerContacts: current.headerContacts,
    };
  }, [attachedForm, availableForms]);

  /** Документ без бланка — те же поля, что у штатной печати. */
  const freeSheetDocument: ConclusionPDFData = {
    patientFio: sheetContext.patientFio,
    patientDob: sheetContext.patientDob,
    appointmentDate: sheetContext.appointmentDateTime,
    height: heightCm.trim() ? formatQuantity(heightCm) : "",
    weight: weightKg.trim() ? formatQuantity(weightKg) : "",
    temperature: temperature.trim() ? formatQuantity(temperature) : "",
    complaints: patientComplaintsText || "—",
    doctorComplaints: complaints.trim() || "—",
    diagnosis:
      formatDiagnoses(
        selectedDiagnoses.map((d) => ({
          diagnosisCode: d.code,
          title: d.title,
          displayName: d.displayName,
        })),
      ) || "—",
    anamnesis,
    objective,
    conclusion: conclusionText.trim() || "—",
    doctorFio: doctorName,
  };

  // ── штатные поля как узлы ─────────────────────────────────────────────────
  // Одно и то же поле рисуется либо на своём обычном месте, либо в потоке
  // полей бланка — если администратор привязал к нему строку протокола.
  // Поэтому разметка каждого такого поля живёт в одном месте, а решение «где»
  // принимается ниже (slotFree / slotNodes).
  type VitalKind = "heightCm" | "weightKg" | "temperature";

  const VITAL_PROPS: Record<
    VitalKind,
    { label: string; suffix: string; step: number; min: number; max: number; decimals: number }
  > = {
    // Нижние границы совпадают с validateVitals: иначе минус доводил поле до 0
    // и сохранение падало на «от 1 до 999».
    heightCm: {
      label: t("conclusion.height"),
      suffix: t("conclusion.heightUnit"),
      step: 1,
      min: 1,
      max: 999,
      decimals: HEIGHT_DECIMALS,
    },
    // Педиатрия: вес младенца меняется десятыми долями килограмма, а хранится
    // с точностью до грамма (3.456 кг).
    weightKg: {
      label: t("conclusion.weight"),
      suffix: t("conclusion.weightUnit"),
      step: 0.1,
      min: 1,
      max: 999,
      decimals: WEIGHT_DECIMALS,
    },
    temperature: {
      label: t("conclusion.temperature"),
      suffix: "°C",
      step: 0.1,
      min: 34,
      max: 42,
      decimals: TEMPERATURE_DECIMALS,
    },
  };

  const VITAL_STATE: Record<VitalKind, { value: string; onChange: (v: string) => void }> = {
    heightCm: { value: heightCm, onChange: setHeightCm },
    weightKg: { value: weightKg, onChange: setWeightKg },
    temperature: { value: temperature, onChange: setTemperature },
  };

  const vitalNode = (kind: VitalKind, label?: string) => {
    const props = VITAL_PROPS[kind];
    const state = VITAL_STATE[kind];
    // Степпер сам дописывает единицы, а в подписи из бланка они обычно уже
    // есть («Рост, см») — без этого выходило «Рост, см, см».
    const unit = props.suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const shownLabel = label
      ? label.replace(new RegExp(`[\\s,(]*${unit}\\)?\\s*$`, "i"), "") || props.label
      : props.label;
    return (
      <VitalStepper
        label={shownLabel}
        suffix={props.suffix}
        value={state.value}
        onChange={state.onChange}
        step={props.step}
        min={props.min}
        max={props.max}
        decimalPlaces={props.decimals}
        disabled={readOnly}
      />
    );
  };

  /** Куда вести врача из вопроса «завершить без диагноза?». */
  const diagnosisAnchorRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Диагноз для AI — не текстовое поле, а список чипов из каталога, поэтому
   * туда и обратно ходим через текст: модели уходят выбранные диагнозы одной
   * строкой, а её ответ раскладывается обратно по кодам МКБ (см. ниже).
   */
  const applyDiagnosisSuggestion = async (text: string) => {
    const items = await resolveDiagnosesFromText(text, selectedDiagnoses);
    setSelectedDiagnoses(items);
  };

  /**
   * Диагноз (МКБ) — тот же каталожный picker, что и в своей карточке.
   * Занявшему слот полю бланка нужен не текстовый ввод, а живой автокомплит:
   * диагноз выбирают кодом, а не печатают руками (см. FormFieldSlot выше).
   */
  const diagnosisNode = (label?: string, rowId?: string) => (
    // minWidth: 0 — чипы выбранных диагнозов длинные («Z00.1 — Рутинное общее
    // медицинское обследование»), и без этого блок распирает контейнер вширь.
    <Stack
      spacing={0.5}
      ref={diagnosisAnchorRef}
      data-conclusion-row={rowId}
      data-ai-key="diagnosis"
      sx={{ minWidth: 0 }}
    >
      {fieldLabel(
        label ?? t("conclusion.diagnosisIcd"),
        !readOnly && (
          <Tooltip
            title={t(frequentOn ? "conclusion.frequentToggleOff" : "conclusion.frequentToggleOn")}
          >
            <IconButton
              size="small"
              onClick={toggleFrequent}
              aria-pressed={frequentOn}
              aria-label={t("conclusion.frequentToggleLabel")}
              color={frequentOn ? "primary" : "default"}
              sx={{ my: -0.5 }}
            >
              {frequentOn ? (
                <StarOutlined fontSize="small" />
              ) : (
                <StarBorderOutlined fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        ),
      )}
      <AiSuggestionBeside
        suggestion={aiSuggestionNode("diagnosis")}
      >
        <Autocomplete
          multiple
          freeSolo
          disableCloseOnSelect
          options={catalog}
          value={selectedDiagnoses}
          loading={catalogLoading}
          disabled={readOnly}
          filterOptions={(opts) => opts}
          onInputChange={(_, val, reason) => {
            if (reason === "input") setDiagInput(val);
          }}
          noOptionsText={
            diagInput.trim() ? t("conclusion.nothingFound") : t("conclusion.startTypingCode")
          }
          getOptionLabel={(o) =>
            typeof o === "string" ? o : [o.code, o.title].filter(Boolean).join(" — ")
          }
          isOptionEqualToValue={(o, v) => o.id === v.id || (o.code === v.code && o.code !== "")}
          onChange={(_, value) =>
            setSelectedDiagnoses(
              value
                .map((item) =>
                  typeof item === "string"
                    ? { id: -1, code: "", title: item.trim(), displayName: "", isActive: true, sortOrder: 0 }
                    : item,
                )
                .filter((item) => item.title !== ""),
            )
          }
          filterSelectedOptions
          size="small"
          slotProps={{
            // С открытой клавиатурой список переворачивается вверх, а не прячется
            // под неё: padding снизу — её высота.
            popper: popperPadding
              ? {
                  modifiers: [
                    { name: "flip", options: { padding: popperPadding } },
                    { name: "preventOverflow", options: { padding: popperPadding } },
                  ],
                }
              : undefined,
            listbox: listboxMaxHeight ? { sx: { maxHeight: listboxMaxHeight } } : undefined,
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={readOnly ? "—" : t("conclusion.diagnosisPlaceholder")}
            />
          )}
        />
      </AiSuggestionBeside>
      {catalogError && (
        <Alert severity="warning" sx={{ py: 0 }}>
          {t("conclusion.catalogLoadFailed")}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, minHeight: 44, bgcolor: "background.default" }}>
        <Typography variant="body2" color={selectedDiagnoses.length ? "text.primary" : "text.disabled"}>
          {selectedDiagnoses.length
            ? selectedDiagnoses.map((d) => [d.code, d.title].filter(Boolean).join(" ")).join(". ")
            : t("conclusion.noDiagnosis", {
                selected: agree(term.diagnosis.gender, ["выбран", "выбрана", "выбрано"]),
              })}
        </Typography>
      </Paper>
      {/* Диагнозы прошлых визитов пациента — в один клик: на повторном приёме
          врач обычно ставит тот же код, а искать его в каталоге заново долго. */}
      {!readOnly && historyDx.length > 0 && (
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ pt: 0.25 }}>
          <Typography variant="caption" color="text.secondary">
            {t("conclusion.historyDiagnoses")}
          </Typography>
          {historyDx.map((dx) =>
            quickDiagnosisChip(
              dx,
              dx.title ? `${dx.code} — ${dx.title}` : dx.code,
              // Запись каталога подставит эффект дозаполнения по коду,
              // как у диагнозов, восстановленных из сохранённого заключения.
              catalog.find((c) => c.code === dx.code) ?? {
                id: -1,
                code: dx.code,
                title: dx.title,
                displayName: "",
                isActive: true,
                sortOrder: 0,
              },
            ),
          )}
        </Stack>
      )}
      {/* Частые коды самого врача — рутину (осмотр, ОРВИ) не ищут в каталоге. */}
      {!readOnly && frequentOn && (frequentDx.length > 0 || frequentEmpty) && (
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ pt: 0.25 }}>
          <Typography variant="caption" color="text.secondary">
            {t("conclusion.frequentDiagnoses")}
          </Typography>
          {frequentEmpty ? (
            <Typography variant="caption" color="text.disabled">
              {t("conclusion.frequentDiagnosesEmpty")}
            </Typography>
          ) : (
            frequentDx.map((dx) =>
              quickDiagnosisChip(
                dx,
                `${dx.code} — ${dx.title}
${t("conclusion.frequentDiagnosesHint", { count: dx.count })}`,
                // Ручка отдаёт запись активного каталога — берём её как есть.
                catalog.find((c) => c.id === dx.id) ?? {
                  id: dx.id,
                  code: dx.code,
                  title: dx.title,
                  displayName: dx.displayName ?? "",
                  isActive: true,
                  sortOrder: 0,
                },
              ),
            )
          )}
        </Stack>
      )}
    </Stack>
  );

  /** Подписи целевых полей — те же слова, что видит врач в форме. */
  const TARGET_LABELS: Record<FormTarget, string> = {
    conclusion: t("conclusion.conclusionRequired"),
    anamnesis: t("conclusion.anamnesis"),
    objective: t("conclusion.objectively"),
  };

  /**
   * Итог бланка — не поле ввода, а результат: сворачиваемый блок вместо
   * заблокированной копии текста.
   *
   * Read-only поле на том же месте дублировало строки, введённые парой
   * сантиметров выше, занимало треть высоты дровера и выглядело сломанным —
   * первое, что делает врач, это пробует в него написать. Посмотреть, что
   * уйдёт в карту и в печать, всё равно нужно, поэтому блок раскрывается
   * одним нажатием.
   */
  const projectionNode = (label: string, text: string, error: string | null) => (
    <Stack spacing={0.5}>
      <Button
        size="small"
        color="inherit"
        onClick={() => setProjectionOpen((prev) => !prev)}
        endIcon={projectionOpen ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
        sx={{ alignSelf: "flex-start", color: "text.secondary", fontWeight: 600 }}
      >
        Что уйдёт в «{label}»
      </Button>
      <Collapse in={projectionOpen} unmountOnExit>
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography
            variant="body2"
            color={text.trim() ? "text.primary" : "text.disabled"}
            sx={{ whiteSpace: "pre-wrap" }}
          >
            {text.trim() || "Пока пусто — заполните строки бланка."}
          </Typography>
        </Paper>
      </Collapse>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );

  /**
   * Подпись поля. Кнопки AI у полей больше нет — одна на всю форму, в шапке
   * (AiAssistHeaderButton); у поля остаётся только плашка предложения.
   */
  const fieldLabel = (label: React.ReactNode, action?: React.ReactNode) => (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      {action}
    </Stack>
  );

  /**
   * Плашка с предложением AI слева от поля (AiSuggestionBeside). Текст поля
   * не трогает: в него попадает только то, что врач применил сам (`apply`).
   * Без предложения — null, чтобы поле не делило ширину с пустотой.
   * При колонке подсказок (aiGutterFits) у полей плашек нет — они в ней.
   */
  const aiSuggestionNode = (aiField: AiAssistKey) => {
    if (!canAiAssist || aiGutterFits || !ai.of(aiField).suggestion) return null;
    const target = aiReviewTargets().find((item) => item.key === aiField);
    if (!target) return null;
    return (
      <AiAssistSuggestion
        state={ai.of(aiField)}
        current={target.current}
        onApply={() => applyAiSuggestion(target)}
        onDismiss={() => dismissAiSuggestion(target)}
      />
    );
  };

  /** Текстовое поле заключения одним узлом: подпись + поле. */
  const textFieldNode = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    options: {
      minRows?: number;
      required?: boolean;
      hint?: string;
      locked?: boolean;
      /** Поле AI-помощника; без него плашки предложения AI нет. */
      aiField?: AiAssistField;
      /**
       * Метка строки для перехода к полю (счётчик заполненности). Только у
       * штатного поля: в потоке бланка метку ставит сама строка бланка.
       */
      rowId?: string;
    } = {},
  ) => {
    const aiField = options.locked ? undefined : options.aiField;
    return (
      <Stack spacing={0.5} data-conclusion-row={options.rowId} data-ai-key={aiField}>
        {fieldLabel(
          <>
            {label} {options.required && !readOnly && "*"}
          </>,
        )}
        <AiSuggestionBeside suggestion={aiField && aiSuggestionNode(aiField)}>
          <CollapsibleTextField
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={readOnly || Boolean(options.locked)}
            minRows={options.minRows ?? 2}
            fullWidth
            size="small"
            placeholder={readOnly ? "—" : t("conclusion.optional")}
            helperText={options.hint}
          />
        </AiSuggestionBeside>
      </Stack>
    );
  };

  /**
   * Штатное поле показываем на своём месте, только если бланк его не забрал.
   *
   * ⚠ Объявление обязано стоять ВЫШЕ freeVitals: `const` не поднимается, и
   * вызов из freeVitals на строку раньше падал в TDZ («Cannot access 'slotFree'
   * before initialization») — дровер заключения не открывался вовсе.
   */
  const slotFree = (slot: FormFieldSlot) => !attachedSlots.has(slot);

  /**
   * Поле, которое собирает бланк. Врач его не правит: текст — проекция
   * значений полей выше, и правку пришлось бы разбирать обратно в поля, а
   * такой разбор врёт на любой вольности формулировки. Вместо поля ввода на
   * его месте стоит сворачиваемый итог (projectionNode).
   *
   * ⚠ Стоит выше standardShown/freeVitals по той же причине, что и slotFree.
   */
  const managedByForm = (field: FormTarget) =>
    attachedForm != null && attachedForm.target === field;

  /** Текущее значение штатной колонки — чтобы знать, есть ли что прятать. */
  const columnValue: Record<FormFieldSlot, string> = {
    complaints,
    anamnesis,
    objective,
    diagnosis: selectedDiagnoses.length > 0 ? "есть" : "",
    conclusion: conclusionText,
    heightCm,
    weightKg,
    temperature,
  };

  /**
   * Нужные бланку штатные колонки, которые приходится оставлять под ним.
   *
   * Прикреплённый бланк — это и есть документ: что администратор собрал в
   * конструкторе, то врач и заполняет, и только это уходит на бумагу. Раньше
   * под бланком стояли все штатные поля (жалобы, анамнез, объективно, рост,
   * вес, температура), хотя в бланке уже были свои «Жалобы:» и «Объективные
   * данные» — врачи писали то туда, то сюда, а печать допечатывала штатные
   * колонки хвостом под листом (прод, клиника 21, 21.09.2026).
   *
   * Диагноз МКБ подчиняется тому же правилу (решение 21.09.2026: на протоколах
   * УЗИ и в дневнике беременной он печатался лишним). Бланку, которому нужны
   * коды МКБ, администратор привязывает строку к колонке «Диагноз (МКБ)» —
   * тогда выбор диагноза встаёт в поток бланка.
   *
   * Исключения:
   *  - «Заключение» — если бланк собирает текст не в него (карта гинеколога
   *    пишет в «Анамнез»): поле обязательное, и без него врачу негде записать
   *    назначения.
   *  - Колонка, в которой уже есть текст, — прятать данные нельзя: они всё
   *    равно ушли бы в печать, а врач их не видел бы. Стёр — поле исчезает.
   */
  const standardShown = (slot: FormFieldSlot) => {
    if (!slotFree(slot)) return false; // стоит в потоке полей бланка
    if (!attachedForm) return true;
    if (slot === "conclusion") return true;
    if (slot === "anamnesis" || slot === "objective") {
      if (managedByForm(slot)) return true; // итог бланка (projectionNode)
    }
    return columnValue[slot].trim() !== "";
  };

  /** Видит ли врач колонку хоть где-то: своим полем или строкой бланка. */
  const columnVisible = (slot: FormFieldSlot) => !slotFree(slot) || standardShown(slot);

  /**
   * «Заполнено ранее»: колонка с текстом, которой в прикреплённом бланке нет.
   *
   * Такое поле видно только потому, что в нём уже есть значение (старое
   * заключение, другой бланк до смены). Раньше оно стояло на своём штатном
   * месте, и температура оказывалась над бланком, где её никто не ждёт
   * (заключение 08.09 педиатра, открытое по бланку гинеколога, 21.09.2026).
   * Теперь все такие поля собраны под бланком одним блоком с пояснением и
   * кнопкой «Очистить». Итог бланка (projectionNode) и обязательное
   * «Заключение» сюда не относятся — это не остаток, а часть документа.
   */
  const isLeftover = (slot: FormFieldSlot) =>
    attachedForm != null &&
    slotFree(slot) &&
    slot !== "conclusion" &&
    !((slot === "anamnesis" || slot === "objective") && managedByForm(slot)) &&
    columnValue[slot].trim() !== "";

  const LEFTOVER_ORDER: FormFieldSlot[] = [
    "heightCm",
    "weightKg",
    "temperature",
    "complaints",
    "anamnesis",
    "objective",
    "diagnosis",
  ];
  const leftoverSlots = LEFTOVER_ORDER.filter(isLeftover);

  const clearLeftovers = () => {
    for (const slot of leftoverSlots) {
      if (slot === "heightCm") setHeightCm("");
      else if (slot === "weightKg") setWeightKg("");
      else if (slot === "temperature") setTemperature("");
      else if (slot === "complaints") setComplaints("");
      else if (slot === "anamnesis") setAnamnesis("");
      else if (slot === "objective") setObjective("");
      else if (slot === "diagnosis") setSelectedDiagnoses([]);
    }
  };

  /** Степперы, которые бланк не забрал и которые не спрятаны под бланком. */
  const freeVitals = (Object.keys(VITAL_PROPS) as VitalKind[]).filter((kind) =>
    standardShown(kind),
  );
  /** Без бланка степперы стоят сверху; при бланке остатки — в блоке под ним. */
  const topVitals = attachedForm ? [] : freeVitals;
  const leftoverVitals = attachedForm ? freeVitals : [];

  /**
   * Перенесённые с регистрации жалобы под бланком без строки жалоб: поле
   * спрятано, но текст ушёл бы в печать отдельным «Жалобы» под листом.
   * Снимаем только нетронутый перенос — то, что врач написал сам, остаётся
   * (и потому остаётся видимым). Первичная запись при этом не теряется: блок
   * «Жалобы пациента» снова показывается, как только поле разошлось с ней.
   */
  const dropPrefilledComplaints = (form: ConclusionFormTemplate) => {
    if (form.fields.some((field) => field.slot === "complaints")) return;
    const prefill = patientComplaintsText;
    if (!prefill) return;
    // Функциональное обновление: при подстановке бланка по умолчанию эффект
    // может сработать в одном проходе с гидратацией, и `complaints` из
    // замыкания ещё пустое.
    setComplaints((prev) => (prev.trim() === prefill ? "" : prev));
  };

  /**
   * Смена бланка, которая молча уничтожила бы текст врача, — через вопрос.
   *
   * Бланк собирает свою колонку заново из строк, поэтому:
   *  - без бланка: текст, который врач написал в этой колонке руками (в том
   *    числе после «Открепить»), был бы заменён строками бланка;
   *  - с бланком: введённые строки прежнего бланка сбросились бы на нормы
   *    нового.
   * Оба раза врач терял текст без предупреждения (проверка флоу 21.09.2026).
   */
  const [pendingFormSwitch, setPendingFormSwitch] = React.useState<{
    form: ConclusionFormTemplate;
    /** Текст колонки, который бланк заменит (только без прикреплённого бланка). */
    columnText: string | null;
  } | null>(null);

  const targetColumnText = (target: FormTarget) =>
    target === "anamnesis" ? anamnesis : target === "objective" ? objective : conclusionText;

  /** Врач правил строки прикреплённого бланка — они разошлись с нормами. */
  const formValuesEdited = () => {
    if (!attachedForm) return false;
    const defaults = formDefaults(attachedForm);
    return attachedForm.fields.some(
      (field) => (formValues[field.id] ?? "").trim() !== (defaults[field.id] ?? "").trim(),
    );
  };

  /** Бланк, снятый кнопкой «Открепить», — чтобы вернуть его без потерь. */
  const detachedFormRef = React.useRef<{
    form: ConclusionFormTemplate;
    values: Record<string, string>;
    snapshot: ConclusionFormTemplate | null;
    text: string;
  } | null>(null);

  const handleSelectForm = (nextId: number) => {
    const next = selectableForms.find((form) => form.id === nextId);
    if (!next || next.id === attachedForm?.id) return;
    const detached = detachedFormRef.current;
    if (
      !attachedForm &&
      detached &&
      detached.form.id === next.id &&
      targetColumnText(next.target) === detached.text
    ) {
      // Открепили и вернули тот же бланк, текст не трогали: это «отмена
      // открепления» — возвращаем строки как были, спрашивать не о чем.
      detachedFormRef.current = null;
      setFormId(detached.form.id);
      setFormValues(detached.values);
      setFormSnapshot(detached.snapshot);
      return;
    }
    if (!attachedForm) {
      const text = targetColumnText(next.target);
      if (text.trim()) {
        setPendingFormSwitch({ form: next, columnText: text });
        return;
      }
    } else if (formValuesEdited()) {
      setPendingFormSwitch({ form: next, columnText: null });
      return;
    }
    applySelectForm(next);
  };

  const applySelectForm = (next: ConclusionFormTemplate, keepAsManual?: string) => {
    if (keepAsManual?.trim()) {
      // Текст врача уходит в «Дополнительно» — он допишется в конец
      // собранного бланком текста, а не пропадёт.
      setManualText((prev) => [prev.trim(), keepAsManual.trim()].filter(Boolean).join("\n\n"));
    }
    // Колонка, которую собирал прежний бланк, — его проекция, а не текст
    // врача (руками она не правится, хвост врача живёт в manualText). Если
    // новый бланк собирает текст в другую колонку, прежняя осталась бы с
    // заготовкой чужого бланка и напечаталась бы под листом: так на протоколы
    // УЗИ попадал «Анамнез» из карты гинеколога (прод, 21.09.2026).
    if (attachedForm && attachedForm.target !== next.target) {
      if (attachedForm.target === "anamnesis") setAnamnesis("");
      else if (attachedForm.target === "objective") setObjective("");
      else setConclusionText("");
    }
    dropPrefilledComplaints(next);
    setFormId(next.id);
    setFormValues(formDefaults(next));
    // Врач выбрал другой бланк — снапшот прежнего заполнения больше не при
    // делах. Выбор того же бланка из снапшота его сохраняет: актуальной
    // версии этого шаблона в выдаче может уже не быть.
    setFormSnapshot(next === formSnapshot ? formSnapshot : null);
    // Хвост не сбрасываем: это вывод врача, а не часть протокола — он
    // остаётся при смене бланка и снова попадёт в конец проекции.
  };

  /**
   * Поля, по которым одна кнопка «Помощь AI» просит подсказку, — текущий
   * текст каждого и то, как предложение ложится обратно. Поле, текст которого
   * собирает бланк (вместо ввода — итог projectionNode), в пачку не идёт:
   * применить к нему подсказку некуда.
   */
  const aiTargets = (): Array<{
    field: AiAssistField;
    text: string;
    apply: (text: string) => void;
  }> => {
    // Спрятанную под бланком колонку не предлагаем: подсказка легла бы в
    // поле, которого врач не видит, и ушла бы в печать мимо него.
    const editable = (field: FormTarget) =>
      columnVisible(field) && (!slotFree(field) || !managedByForm(field));
    const targets: Array<{ field: AiAssistField; text: string; apply: (text: string) => void }> =
      columnVisible("complaints")
        ? [{ field: "complaints", text: complaints, apply: setComplaints }]
        : [];
    if (editable("anamnesis")) targets.push({ field: "anamnesis", text: anamnesis, apply: setAnamnesis });
    if (editable("objective")) targets.push({ field: "objective", text: objective, apply: setObjective });
    if (columnVisible("diagnosis")) {
      targets.push({
        field: "diagnosis",
        text: diagnosesAsText(selectedDiagnoses),
        apply: (text) => void applyDiagnosisSuggestion(text),
      });
    }
    if (editable("conclusion")) {
      targets.push({ field: "conclusion", text: conclusionText, apply: setConclusionText });
    }
    return targets;
  };

  /**
   * Свободные строки прикреплённого бланка — для AI (бэк 27.09.2026).
   * Привязанные к колонке (`slot`) сюда не идут: они уже в `aiTargets` как
   * колонки. Значение — без подписи, подпись модель получает отдельно.
   */
  const aiFormRows = () =>
    (attachedForm?.fields ?? [])
      .filter((field) => !field.slot)
      .map((field) => ({
        id: field.id,
        label: field.label || field.placeholder || "Строка бланка",
        text: formValues[field.id] ?? "",
        multiline: field.type === "multiline",
      }));

  const setFormRowValue = (fieldId: string, value: string) =>
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));

  const handleAiRequest = () =>
    void ai.requestAll(
      aiTargets().map(({ field, text }) => ({ field, text })),
      // Колонку `target` из пачки уберёт сам запрос: бэк просит её не слать.
      attachedForm
        ? {
            title: attachedForm.title || attachedForm.name,
            target: attachedForm.target,
            rows: aiFormRows(),
          }
        : null,
    );

  /** Подпись колонки для проверки: из бланка, если он её занял (как в форме). */
  const aiColumnLabel = (field: AiAssistField): string => {
    const fromForm = attachedForm?.fields.find((f) => f.slot === field)?.label ?? "";
    const caption = fieldCaption(fromForm).replace(/:$/, "");
    if (caption) return caption;
    switch (field) {
      case "complaints":
        return t("conclusion.doctorComplaints");
      case "anamnesis":
        return t("conclusion.anamnesis");
      case "objective":
        return t("conclusion.objectively");
      case "diagnosis":
        return t("conclusion.diagnosisIcd");
      default:
        return t("conclusion.conclusionRequired");
    }
  };

  /**
   * Поля для режима проверки — в том порядке, в каком врач видит их в
   * форме: строки бланка и занятые им колонки по бланку, остальные колонки
   * следом. Снимок для отмены у текста — строка, у диагноза — набор
   * выбранных диагнозов: из текста он точно не восстанавливается.
   */
  const aiReviewTargets = (): AiReviewTarget[] => {
    const columns = new Map(
      aiTargets().map(({ field, text, apply }): [AiAssistField, AiReviewTarget] => [
        field,
        {
          key: field,
          label: aiColumnLabel(field),
          current: text,
          apply,
          capture:
            field === "diagnosis"
              ? () => {
                  const prev = selectedDiagnoses;
                  return () => setSelectedDiagnoses(prev);
                }
              : () => () => apply(text),
        },
      ]),
    );
    const rows = new Map(aiFormRows().map((row) => [row.id, row]));
    const ordered: AiReviewTarget[] = [];
    for (const field of attachedForm?.fields ?? []) {
      if (field.slot) {
        const column = columns.get(field.slot as AiAssistField);
        if (column) {
          ordered.push(column);
          columns.delete(field.slot as AiAssistField);
        }
        continue;
      }
      const row = rows.get(field.id);
      if (!row) continue;
      ordered.push({
        key: aiRowKey(row.id),
        label: fieldCaption(row.label).replace(/:$/, "") || row.label,
        current: row.text,
        apply: (text) => setFormRowValue(row.id, text),
        capture: () => () => setFormRowValue(row.id, row.text),
      });
    }
    return [...ordered, ...columns.values()];
  };

  const handleAiReview = () => {
    // Очередь — по порядку формы, а не по порядку ответа модели.
    const order = aiReviewTargets().map((target) => target.key);
    const entries = order
      .filter((key) => ai.of(key).suggestion != null)
      .map((key) => ({
        key,
        suggestion: ai.of(key).suggestion as string,
        source: ai.of(key).source,
        reason: ai.of(key).reason,
      }));
    if (entries.length > 0) setAiReview(entries);
  };

  /**
   * Принять подсказку: снимок поля до применения — для «Вернуть» (у
   * диагноза это набор выбранных диагнозов, из текста он не собирается).
   */
  const applyAiSuggestion = (target: AiReviewTarget) => {
    const restoreField = target.capture();
    const text = ai.take(target.key);
    if (text == null) return;
    target.apply(text);
    setAiUndo({
      key: target.key,
      kind: "applied",
      onUndo: () => {
        restoreField();
        ai.restore(target.key, text);
        setAiUndo(null);
      },
    });
  };

  const dismissAiSuggestion = (target: AiReviewTarget) => {
    const text = ai.of(target.key).suggestion;
    ai.dismiss(target.key);
    if (text == null) return;
    setAiUndo({
      key: target.key,
      kind: "dismissed",
      onUndo: () => {
        ai.restore(target.key, text);
        setAiUndo(null);
      },
    });
  };

  const handleAiApplyAll = () => {
    for (const target of aiTargets()) {
      const text = ai.take(target.field);
      if (text != null) target.apply(text);
    }
    for (const row of aiFormRows()) {
      const text = ai.take(aiRowKey(row.id));
      if (text != null) setFormRowValue(row.id, text);
    }
  };

  const handleAiDismissAll = () => {
    for (const key of ai.suggestedKeys) ai.dismiss(key);
  };

  const handleDetachForm = () => {
    // Текст остаётся: врач дописывает уже собранное заключение руками.
    // Бланк со строками запоминаем: вернули его, не трогая текст, — строки
    // восстанавливаются, а не сбрасываются на нормы (см. handleSelectForm).
    if (attachedForm) {
      detachedFormRef.current = {
        form: attachedForm,
        values: formValues,
        snapshot: formSnapshot,
        text: targetColumnText(attachedForm.target),
      };
    }
    setFormId(null);
    setFormValues({});
    setFormSnapshot(null);
  };

  /**
   * Контролы для привязанных полей бланка. Собираем только те слоты, которые
   * бланк действительно занял: незанятые остаются на своих обычных местах.
   */
  const slotNodes = React.useMemo<Partial<Record<FormFieldSlot, React.ReactNode>>>(() => {
    const nodes: Partial<Record<FormFieldSlot, React.ReactNode>> = {};
    /**
     * Подпись строки — из бланка, а не название колонки. Врач заполняет
     * документ, каким его собрал администратор: «План ведения», «DS»,
     * «Жалобы», — а видел «Заключение», «Диагноз (МКБ-10)», «Жалобы (врач)»
     * (21.09.2026). На печати подписи и так из бланка. Пустая подпись в
     * бланке — тогда название колонки, иначе поле осталось бы безымянным.
     */
    const slotLabel = (slot: FormFieldSlot, fallback: string) => {
      const label = attachedForm?.fields.find((field) => field.slot === slot)?.label ?? "";
      return fieldCaption(label).replace(/:$/, "") || fallback;
    };
    for (const slot of attachedSlots) {
      switch (slot) {
        case "complaints":
          nodes.complaints = textFieldNode(
            slotLabel(slot, t("conclusion.doctorComplaints")),
            complaints,
            setComplaints,
            { aiField: "complaints" },
          );
          break;
        case "anamnesis":
          nodes.anamnesis = textFieldNode(
            slotLabel(slot, t("conclusion.anamnesis")),
            anamnesis,
            setAnamnesis,
            { minRows: 3, aiField: "anamnesis" },
          );
          break;
        case "objective":
          nodes.objective = textFieldNode(
            slotLabel(slot, t("conclusion.objectively")),
            objective,
            setObjective,
            { minRows: 3, aiField: "objective" },
          );
          break;
        case "diagnosis":
          nodes.diagnosis = diagnosisNode(slotLabel(slot, t("conclusion.diagnosisIcd")));
          break;
        case "conclusion":
          // Звёздочку «обязательно» ставит textFieldNode по `required`.
          nodes.conclusion = textFieldNode(
            slotLabel(slot, t("conclusion.conclusionRequired")),
            conclusionText,
            setConclusionText,
            { minRows: 4, required: true, aiField: "conclusion" },
          );
          break;
        case "heightCm":
        case "weightKg":
        case "temperature":
          nodes[slot] = (
            <Stack direction="row" spacing={1.5}>
              {vitalNode(slot, slotLabel(slot, VITAL_PROPS[slot].label))}
            </Stack>
          );
          break;
        default:
          break;
      }
    }
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attachedSlots,
    attachedForm,
    complaints,
    anamnesis,
    objective,
    conclusionText,
    heightCm,
    weightKg,
    temperature,
    selectedDiagnoses,
    catalog,
    catalogLoading,
    catalogError,
    diagInput,
    readOnly,
    // Кнопка и плашка AI живут внутри узлов бланка: без этих deps «AI думает…»
    // и пришедшее предложение не перерисуются. `ai.of` меняется вместе с
    // состоянием подсказок (useCallback на state).
    canAiAssist,
    ai.of,
    // Подсказки диагнозов из истории пациента живут в узле диагноза.
    historyQuery.data,
  ]);

  /**
   * Печать: одна кнопка, один документ, собирается не здесь.
   *
   * Дровер только открывает страницу печати — она берёт заключение с сервера
   * и сама решает, печатать лист бланка с хвостом или штатный документ (см.
   * pages/print/ConclusionPrintPage). Собирать документ здесь, из состояния
   * формы, нельзя: на бумагу уходили бы несохранённые правки — в карте одно, у
   * пациента на руках другое.
   */
  const openPrint = () => {
    if (!conclusion) return;
    window.open(
      `/print/conclusion/${conclusion.appointmentId}?lineId=${serviceLineId}&conclusionId=${conclusion.id}`,
      "_blank",
      "noopener",
    );
  };

  const runSave = async (targetStatus: ConclusionStatus, print: boolean) => {
    const saved = await handleSave(targetStatus);
    if (saved && print) openPrint();
  };

  /**
   * Завершение без диагноза — осознанное действие, а не оплошность.
   *
   * Завершить заключение без диагноза до 08.09.2026 можно было молча: проверка
   * требовала только непустой текст. Врач забывал выбрать код МКБ, и в карте
   * оставалась запись, по которой нельзя ни собрать историю диагнозов, ни
   * посчитать заболеваемость.
   *
   * ⚠ Жёсткий запрет здесь не годится: у диагностических услуг диагноза и не
   * должно быть — протокол УЗИ прямо заканчивается строкой «не является
   * диагнозом и оценивается лечащим врачом». Отличить приём врача от
   * исследования дровер пока не может: категория услуги (doctor/lab/hardware)
   * сюда не передаётся. Поэтому спрашиваем один раз, а не запрещаем; когда
   * категория появится в пропсах, для приёмов врача это станет запретом.
   */
  const [confirmNoDiagnosis, setConfirmNoDiagnosis] = React.useState<{ print: boolean } | null>(
    null,
  );

  const requestSave = (targetStatus: ConclusionStatus, print: boolean) => {
    // Бланк без диагноза (протокол УЗИ) — диагноз здесь не ставят, и спросить
    // про него значило бы спросить про поле, которого врач не видит.
    if (
      targetStatus === "completed" &&
      selectedDiagnoses.length === 0 &&
      columnVisible("diagnosis")
    ) {
      // Остальные проверки — до вопроса: незачем спрашивать про диагноз, если
      // форма всё равно не пройдёт валидацию.
      if (!vitals.validate() || !completion.validate()) return;
      setConfirmNoDiagnosis({ print });
      return;
    }
    void runSave(targetStatus, print);
  };

  /**
   * В правке печатаем только после сохранения — печатается ровно то, что легло
   * в карту. Не прошла валидация — не печатаем, ошибку показывает форма.
   */
  const handleSaveAndPrint = () => requestSave(status, true);

  // Каталог МКБ-10 приходит уже после гидратации: дозаполняем выбранные
  // диагнозы настоящими записями каталога, не трогая остальные поля формы.
  // Baseline правим тем же движением — иначе техническая замена объекта
  // диагноза выглядела бы как правка врача и плодила пустые черновики.
  React.useEffect(() => {
    if (!open || catalog.length === 0) return;
    setSelectedDiagnoses((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        if (d.id > 0) return d;
        const fromCatalog = catalog.find((c) => c.code === d.code);
        if (!fromCatalog) return d;
        changed = true;
        return fromCatalog;
      });
      if (!changed) return prev;
      try {
        const baseline = JSON.parse(baselineRef.current) as ConclusionDraftBody;
        baselineRef.current = JSON.stringify({ ...baseline, selectedDiagnoses: next });
      } catch {
        /* baseline ещё не собран — следующая гидратация его перезапишет */
      }
      return next;
    });
  }, [open, catalog]);

  // ── autosave draft to localStorage (1 заключение = 1 запись) ──────────────
  React.useEffect(() => {
    if (!open || readOnly || !hydratedRef.current) return;
    const body: ConclusionDraftBody = {
      complaints,
      anamnesis,
      objective,
      conclusionText,
      selectedDiagnoses,
      photoUrls,
      weightKg,
      heightCm,
      temperature,
      internalComment,
      status,
      formId,
      formValues,
      formManual: manualText,
      formSnapshot,
    };
    // Пока пользователь ничего не менял — фантомный черновик не создаём.
    if (JSON.stringify(body) === baselineRef.current) {
      pendingDraftRef.current = null;
      return;
    }
    pendingDraftRef.current = body;
    const timer = window.setTimeout(() => {
      // hydratedRef сбрасывается после сохранения на сервер — отложенная
      // запись не должна воскресить уже удалённый черновик.
      if (hydratedRef.current) {
        writeConclusionDraft(draftId, body);
        pendingDraftRef.current = null;
        setDraftSavedAt(new Date().toISOString());
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    open,
    readOnly,
    draftId,
    complaints,
    anamnesis,
    objective,
    conclusionText,
    selectedDiagnoses,
    photoUrls,
    weightKg,
    heightCm,
    temperature,
    internalComment,
    status,
    formId,
    formValues,
    formSnapshot,
    manualText,
  ]);

  // Размонтирование (дровер удаляют из дерева, уход со страницы) — дописываем
  // незаписанный хвост черновика.
  React.useEffect(() => {
    return () => {
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(draftId, pendingDraftRef.current);
        pendingDraftRef.current = null;
      }
    };
  }, [draftId]);

  // ── load diagnosis catalog when drawer opens / search changes ─────────────
  // Каталог МКБ-10 большой (тысячи записей); тянуть его целиком и фильтровать на
  // клиенте нельзя — бэкенд отдаёт лишь часть, и диагнозы за её пределами «не
  // находятся». Ищем на сервере по введённому тексту (search), с debounce.
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const term = diagInput.trim();
    setCatalogLoading(true);
    setCatalogError(false);
    const timer = window.setTimeout(() => {
      getDiagnoses(term || undefined, ctrl.signal)
        .then((items) => setCatalog(items))
        .catch(() => {
          // Каталог недоступен — поле остаётся рабочим, но молчать нельзя:
          // пустой список выглядит как «поиск не работает».
          if (!ctrl.signal.aborted) setCatalogError(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setCatalogLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, diagInput]);

  // Сбрасываем поисковый ввод при закрытии, чтобы при повторном открытии не
  // тянуть каталог по устаревшему запросу.
  React.useEffect(() => {
    if (!open) setDiagInput("");
  }, [open]);

  // ── load conclusion templates when drawer opens ───────────────────────────
  React.useEffect(() => {
    if (!open || readOnly) return;
    const ctrl = new AbortController();
    getConclusionTemplates(ctrl.signal)
      .then(setTemplates)
      .catch(() => {
        /* шаблоны недоступны — кнопка просто покажет пустой список */
      });
    return () => ctrl.abort();
  }, [open, readOnly]);

  // ── заготовки: шаблоны и «как в прошлый раз» ──────────────────────────────
  /**
   * Заготовка документа — сохранённый шаблон или прошлое заключение пациента.
   * Обе несут тексты колонок и, если есть, заполненный бланк; применяются
   * одним правилом (conclusionPresets), чтобы текст не терялся под бланком.
   */
  type ConclusionPreset = {
    texts: PresetTexts;
    form: ParsedConclusionForm | null;
    /** Тост после применения. */
    message: string;
  };

  /** Заготовка, ждущая подтверждения: в документе уже есть что терять. */
  const [pendingPreset, setPendingPreset] = React.useState<ConclusionPreset | null>(null);

  /**
   * Есть ли в документе текст врача. Колонка, которую собирает бланк, — не его
   * текст (её покрывают строки бланка), нетронутый перенос жалоб — тоже.
   */
  const documentHasContent = () =>
    formValuesEdited() ||
    manualText.trim() !== "" ||
    (!managedByForm("anamnesis") && anamnesis.trim() !== "") ||
    (!managedByForm("objective") && objective.trim() !== "") ||
    (!managedByForm("conclusion") && conclusionText.trim() !== "");

  const applyPresetNow = (preset: ConclusionPreset) => {
    const parsed = preset.form;
    let targetForm: ConclusionFormTemplate | null = attachedForm;
    let formApplied = false;
    if (parsed) {
      // Бланк заготовки: актуальный из выдачи, иначе её снимок (бланк могли
      // выключить или закрепить за другим филиалом).
      const listed = selectableForms.find((form) => form.id === parsed.formId) ?? null;
      const next = listed ?? parsed.snapshot;
      if (next) {
        if (next.id !== attachedForm?.id) {
          applySelectForm(next);
          if (!listed) setFormSnapshot(parsed.snapshot);
          targetForm = next;
        }
        const form = targetForm ?? next;
        setFormValues(presetFormValues(form.fields, formDefaults(form), parsed.values));
        formApplied = true;
      }
    }

    // Колонку-адресат бланка заготовки не переносим текстом: это собранные
    // строки, они уже легли в поля; ручной хвост заготовки идёт отдельно.
    const texts: PresetTexts =
      formApplied && targetForm ? { ...preset.texts, [targetForm.target]: undefined } : preset.texts;
    const plan = planPresetTexts({
      texts,
      formTarget: targetForm?.target ?? null,
      // Под бланком колонка видна своим полем, если бланк привязал к ней
      // строку; «Заключение» стоит штатным полем всегда (обязательное).
      visible: (column) =>
        column === "conclusion" || Boolean(targetForm?.fields.some((field) => field.slot === column)),
    });
    if (plan.set.complaints != null) setComplaints(plan.set.complaints);
    if (plan.set.anamnesis != null) setAnamnesis(plan.set.anamnesis);
    if (plan.set.objective != null) setObjective(plan.set.objective);
    if (plan.set.conclusion != null) setConclusionText(plan.set.conclusion);
    if (targetForm) {
      setManualText((prev) =>
        mergeManual(formApplied ? "" : prev, formApplied ? parsed?.manual : "", ...plan.manual),
      );
    }
    notify?.({ type: "success", message: preset.message });
  };

  /**
   * Заменяет ли заготовка написанное: бланк заготовки переписывает строки, а
   * без бланка тексты ложатся в поля вместо текущих. Под бланком текстовая
   * заготовка только дописывает «Дополнительно» — спрашивать не о чем.
   */
  const requestPreset = (preset: ConclusionPreset) => {
    const overwrites =
      preset.form != null ||
      (!attachedForm && PRESET_COLUMNS.some((column) => (preset.texts[column] ?? "").trim() !== ""));
    if (overwrites && documentHasContent()) setPendingPreset(preset);
    else applyPresetNow(preset);
  };

  const applyTemplate = (tpl: ConclusionTemplate) =>
    requestPreset({
      texts: { anamnesis: tpl.anamnesis, objective: tpl.objective, conclusion: tpl.conclusion },
      form: parseConclusionFormData(tpl.formData),
      message: t("conclusion.templateApplied"),
    });

  /**
   * «Как в прошлый раз»: протокол прошлого заключения пациента. Жалобы,
   * показатели, диагноз, фото и комментарий не переносим — они про тот визит;
   * диагнозы прошлых визитов предлагаются отдельно, в один клик у поля МКБ.
   */
  const [previousLoading, setPreviousLoading] = React.useState(false);
  const applyPrevious = async (item: PatientConclusionSummary) => {
    setPreviousLoading(true);
    try {
      const full = await getMedicalConclusion(item.id);
      requestPreset({
        texts: { anamnesis: full.anamnesis, objective: full.objective, conclusion: full.conclusion },
        form: parseConclusionFormData(full.formData),
        message: t("conclusion.previous.applied", {
          date: dayjs(item.occurredAt).format("DD.MM.YYYY"),
        }),
      });
    } catch (err: unknown) {
      notify?.({ type: "error", message: parseBackendError(err) });
    } finally {
      setPreviousLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = tplName.trim();
    if (!name) return;
    setTplBusy(true);
    // Колонка, которую собирает бланк, — это строки бланка: в текст шаблона
    // кладём только ручной хвост врача, строки едут в formData. Иначе шаблон,
    // применённый текстом (пока бэк formData не хранит), задвоил бы строки.
    const columnText = (column: FormTarget, value: string) =>
      managedByForm(column) ? manualText.trim() : value.trim();
    const formData = fitConclusionFormData(
      buildConclusionFormData(attachedForm, formValues, manualText),
    ).data;
    try {
      const created = await createConclusionTemplate({
        name,
        conclusion: columnText("conclusion", conclusionText),
        anamnesis: columnText("anamnesis", anamnesis),
        objective: columnText("objective", objective),
        formData,
      });
      setTemplates((prev) => [...prev, created]);
      setSaveTplOpen(false);
      setTplName("");
      notify?.(
        formData && created.formData == null
          ? // Бэк без поля (прод до выкладки тикета 28.09.2026) молча
            // отбрасывает formData — врач должен знать, что строки бланка
            // в шаблон не попали.
            { type: "progress", message: t("conclusion.templateSavedTextOnly") }
          : { type: "success", message: t("conclusion.templateSaved") },
      );
    } catch (err: unknown) {
      notify?.({ type: "error", message: parseBackendError(err) });
    } finally {
      setTplBusy(false);
    }
  };

  /** Удаление шаблона из меню «Документ». */
  const handleDeleteTemplate = async (id: number) => {
    try {
      await deleteConclusionTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      /* ignore */
    }
  };

  // ── validation ────────────────────────────────────────────────────────────
  // Черновик требует только корректных витальных показателей, «Завершить» —
  // ещё и текста заключения: поэтому две независимые проверки.
  const vitals = useFormValidation({
    vitals: validateVitals(weightKg, heightCm, temperature),
  });
  /** Подпись строки бланка, привязанной к «Заключению», — для текста ошибки. */
  const conclusionRowLabel = fieldCaption(
    attachedForm?.fields.find((field) => field.slot === "conclusion")?.label ?? "",
  ).replace(/:$/, "");
  const completion = useFormValidation({
    // Пустое заключение при бланке — это незаполненный протокол, а не
    // незаполненное поле: поля как такового врач уже не видит.
    conclusionText: conclusionText.trim()
      ? null
      : managedByForm("conclusion")
      ? "Заполните хотя бы одну строку бланка — заключение не может быть пустым."
      : conclusionRowLabel
      ? `Заполните «${conclusionRowLabel}» — без этого заключение не завершить.`
      : t("conclusion.errors.fillBeforeComplete"),
  });

  // ── submit ────────────────────────────────────────────────────────────────

  /**
   * Создание заключения с перепривязкой к пересозданной строке услуги.
   *
   * Пока форма открыта (а её держат открытой весь приём), приём могли
   * отредактировать: смена услуги или исполнителя пересоздаёт строку с новым
   * id, и POST по старому отвечает 404 «Service line not found». Врач к этому
   * моменту уже написал текст, поэтому вместо ошибки ищем в свежих слотах
   * строку той же услуги и сохраняем в неё.
   */
  const createConclusionForLine = async (
    payload: MedicalConclusionPayload,
  ): Promise<MedicalConclusion> => {
    // Новый документ — только через «всегда создаёт»: upsert переписал бы первый.
    const create = createAsNew ? createAdditionalConclusion : upsertConclusion;
    try {
      return await create(serviceLineId, payload);
    } catch (err: unknown) {
      if (!isServiceLineGoneError(err) || appointmentId == null) throw err;
      const slots = await getConclusionSlots(appointmentId);
      const fresh = findReplacementSlot(slots, { serviceLineId, serviceId, doctorId });
      // Услуги в приёме больше нет — сохранять некуда, дальше ветка ошибки.
      if (!fresh) throw err;
      // Новый документ на пересозданной строке — снова новый документ: у
      // свежей строки уже может быть свой первый, и его не трогаем.
      const saved =
        createAsNew && fresh.conclusion?.id
          ? await createAdditionalConclusion(fresh.serviceLineId, payload)
          : fresh.conclusion?.id
          ? await updateConclusion(fresh.conclusion.id, payload)
          : await upsertConclusion(fresh.serviceLineId, payload);
      clearConclusionDraft(conclusionDraftId(fresh.serviceLineId, draftScope));
      return saved;
    }
  };

  /** Возвращает сохранённое заключение либо null — «сохранить и печать» ждёт его. */
  const handleSave = async (
    targetStatus: ConclusionStatus,
  ): Promise<MedicalConclusion | null> => {
    if (!vitals.validate()) return null;
    if (targetStatus === "completed" && !completion.validate()) return null;

    setSaveError(null);
    setSaving(true);

    // Заполненный бланк едет на сервер рядом с собранным текстом: текст
    // печатают и читают, а `formData` возвращает врачу те же строки протокола
    // при следующем открытии. Бланк откреплён — шлём явный null: PATCH без
    // поля сохранил бы прежнее значение, и открепление не доехало бы.
    const fitted = fitConclusionFormData(
      buildConclusionFormData(attachedForm, formValues, manualText),
    );
    if (fitted.dropped) {
      // Молча терять бланк нельзя: врач должен знать, что при следующем
      // открытии он увидит собранный текст, а не строки.
      notify?.({ type: "error", message: t("conclusion.formDataTooLarge") });
    }

    const payload: MedicalConclusionPayload = {
      complaints: complaints.trim() || null,
      anamnesis: anamnesis.trim() || null,
      objective: objective.trim() || null,
      conclusion: conclusionText.trim() || null,
      diagnosisData: selectedDiagnoses.map((d) => ({
        id: d.id > 0 ? String(d.id) : undefined,
        diagnosisCode: d.code,
        title: d.title,
        displayName: d.displayName || undefined,
      })),
      photoUrls,
      weightKg: weightKg.trim() || null,
      heightCm: heightCm.trim() || null,
      temperature: temperature.trim() || null,
      internalComment: internalComment.trim() || null,
      status: targetStatus,
      formData: fitted.data,
    };

    try {
      let saved: MedicalConclusion;
      if (conclusion?.id) {
        saved = await updateConclusion(conclusion.id, payload);
      } else {
        saved = await createConclusionForLine(payload);
      }
      // Заключение на сервере — локальный черновик больше не нужен.
      clearConclusionDraft(draftId);
      hydratedRef.current = false;
      pendingDraftRef.current = null;
      setDraftSavedAt(null);
      notify?.({
        type: "success",
        message:
          targetStatus === "completed"
            ? t("conclusion.completed", {
                finished: agree(term.conclusion.gender, ["завершён", "завершена", "завершено"]),
              })
            : t("conclusion.draftSaved"),
      });
      onSaved?.(saved);
      onClose();
      return saved;
    } catch (err: unknown) {
      // Сырое «Service line not found» ничего не объясняет врачу: строку
      // услуги удалили правкой приёма, а перепривязать заключение не к чему.
      setSaveError(
        isServiceLineGoneError(err)
          ? t("conclusion.errors.serviceLineGone", { service: serviceName })
          : parseBackendError(err),
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ── photo upload ──────────────────────────────────────────────────────────
  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    setSaveError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const { url } = await uploadConclusionPhoto(file);
        uploaded.push(url);
      }
      setPhotoUrls((prev) => [...prev, ...uploaded]);
    } catch (err: unknown) {
      setSaveError(parseBackendError(err));
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const removePhoto = (url: string) =>
    setPhotoUrls((prev) => prev.filter((u) => u !== url));

  // ── заполненность и переход к полю ────────────────────────────────────────
  /**
   * Что считает счётчик «Заполнено N из M». С бланком — его строки (значение
   * привязанной строки берётся из колонки, как на листе), без бланка — штатные
   * поля документа. Это подсказка, а не проверка: завершить заключение можно
   * и с пустыми строками (пустые на печать не выходят), правило «Завершить»
   * остаётся прежним — непустой текст заключения.
   */
  const progressRows: ProgressRow[] = attachedForm
    ? attachedForm.fields
        .filter((field) => !field.slot || slotNodes[field.slot] != null)
        .map((field) => ({
          id: field.id,
          value: formParts?.sheetValues[field.id] ?? "",
          // У привязанной строки норма не своя: значение живёт в колонке.
          defaultValue: field.slot ? undefined : stripLeadingBlankLines(field.defaultValue ?? ""),
        }))
    : (["complaints", "anamnesis", "objective", "diagnosis", "conclusion"] as const)
        .filter((slot) => standardShown(slot))
        .map((slot) => ({ id: slot, value: columnValue[slot] }));
  const progress = summarizeProgress(progressRows);
  const firstEmptyRow = progress.firstEmpty;

  /** Поставить курсор в строку формы — из счётчика или по клику на лист. */
  const focusRow = (rowId: string) => {
    // Лист мог стоять вместо формы (телефон, колонка приёма) — сначала форма.
    setSheetTab(false);
    window.requestAnimationFrame(() => {
      const row = formColumnRef.current?.querySelector<HTMLElement>(
        `[data-conclusion-row="${CSS.escape(rowId)}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row
        .querySelector<HTMLElement>(
          "textarea:not([aria-hidden='true']):not([readonly]), input:not([type='hidden']):not([aria-hidden='true'])",
        )
        ?.focus({ preventScroll: true });
    });
  };

  /** Строка в фокусе → подсветка её строки на листе. */
  const handleFormFocus = (e: React.FocusEvent<HTMLElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-conclusion-row]");
    setFocusedRow(row?.dataset.conclusionRow ?? null);
  };

  /**
   * Ctrl+Enter — «Завершить», Ctrl+S — дописать черновик в браузер сразу, а
   * не через 400 мс (и не открыть «Сохранить страницу» браузера). На сервер
   * Ctrl+S не отправляет: сохранение на сервер закрывает форму, а Ctrl+S жмут
   * по привычке посреди текста.
   */
  const handleHotkeys = (e: React.KeyboardEvent) => {
    if (readOnly || saving || showHistoryTab || !(e.ctrlKey || e.metaKey)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      requestSave("completed", false);
    } else if (e.code === "KeyS") {
      e.preventDefault();
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(draftId, pendingDraftRef.current);
        pendingDraftRef.current = null;
        setDraftSavedAt(new Date().toISOString());
      }
    }
  };

  // ── derived display ───────────────────────────────────────────────────────
  const lastUpdated = conclusion?.updatedAt
    ? dayjs(conclusion.updatedAt).format("DD.MM.YYYY HH:mm")
    : null;
  const statusChip = !conclusion
    ? { label: t("conclusion.statusNew"), color: "default" as const }
    : conclusion.status === "completed"
      ? { label: t("conclusion.statusCompleted"), color: "success" as const }
      : { label: t("conclusion.statusDraft"), color: "warning" as const };
  /**
   * Подпись в футере: статус документа и где лежит последняя правка — одна
   * мысль, «что сейчас с документом». Сегодняшнее время без даты: строка
   * делит ряд с кнопками.
   */
  const shortTime = (iso: string) =>
    dayjs(iso).isSame(dayjs(), "day") ? dayjs(iso).format("HH:mm") : dayjs(iso).format("DD.MM HH:mm");
  const footerState = [
    statusChip.label,
    draftSavedAt
      ? t("conclusion.savedLocalShort", { time: shortTime(draftSavedAt) })
      : conclusion?.updatedAt
        ? t("conclusion.savedServer", { time: shortTime(conclusion.updatedAt) })
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * Узкий футер: телефон и колонка приёма (~420px). Там четыре кнопки с
   * полными подписями не влезали, и «Завершить» уезжал на вторую строку —
   * «Сохранить и печать» становится иконкой, «Сохранить черновик» — «Черновик».
   */
  const compactFooter = isMobile || inline;
  /** Колонка кабинета (просмотр): документы — в шапке, отдельной полосы нет. */
  const documentInHeader = inline && readOnly && documentBar != null;

  /** Нормы строк прикреплённого бланка — для пометки «норма» и «Вернуть норму». */
  const attachedFormDefaults = React.useMemo(
    () => (attachedForm ? formDefaults(attachedForm) : EMPTY_VALUES),
    [attachedForm, formDefaults],
  );

  /** Зона формы: подпись капсом и содержимое под ней. */
  const sectionNode = (title: string, hint: string | null, body: React.ReactNode) => (
    <Stack component="section" spacing={1.25} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ ...SECTION_TITLE_SX, flexShrink: 0 }}>
          {title}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.disabled" noWrap sx={{ minWidth: 0 }}>
            {hint}
          </Typography>
        )}
      </Stack>
      {body}
    </Stack>
  );

  /**
   * «Дополнительно» — то, что врач дописывает сверх строк бланка. Хвост
   * уходит в конец собранного бланком текста (см. эффект проекции). Когда
   * бланк собирает «Заключение», это и есть вывод врача, и поле стоит в
   * секции «Заключение и рекомендации» без подписи; иначе — в протоколе.
   */
  const manualNode = (withLabel: boolean) =>
    attachedForm ? (
      <Stack spacing={0.5} data-conclusion-row="manual">
        <CollapsibleTextField
          label={withLabel ? t("conclusion.manual.label") : undefined}
          size="small"
          fullWidth
          minRows={withLabel ? 2 : 4}
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder={t("conclusion.manual.placeholder")}
        />
        <Typography variant="caption" color="text.disabled">
          {t("conclusion.manual.hint", { target: TARGET_LABELS[attachedForm.target] })}
        </Typography>
      </Stack>
    ) : null;

  /** «Служебное» раскрыто: врач сам открыл или там уже что-то есть. */
  const serviceExpanded =
    serviceOpen || internalComment.trim() !== "" || photoUrls.length > 0 || uploadingPhoto;

  /** Кнопка «Лист»: справа от формы на широком экране, вместо формы — в узком. */
  const sheetToggleNode = (
    <Tooltip
      title={
        sheetSide
          ? sheetPinned
            ? t("conclusion.sheet.hide")
            : t("conclusion.sheet.show")
          : sheetTab
            ? t("conclusion.sheet.backToForm")
            : t("conclusion.sheet.showTab")
      }
    >
      {/* Иконкой на любой ширине: шапка в одну строку (08.10.2026), подпись
          «Лист» выдавливала имя пациента. Включённый лист — заливкой. */}
      <IconButton
        ref={setSheetButtonEl}
        size="small"
        color={showSheetSide || showSheetTab ? "primary" : "default"}
        aria-pressed={showSheetSide || showSheetTab}
        aria-label={t("conclusion.sheet.toggle")}
        onClick={() => {
          dismissPreviewCoach();
          toggleSheet();
        }}
        sx={showSheetSide || showSheetTab ? { bgcolor: "action.selected" } : undefined}
      >
        {/* «Документ с глазом», а не «две колонки» (08.10.2026): врачи не
            понимали, что за кнопкой — лист, каким он выйдет на печать. */}
        <PreviewOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  /** Заполненность документа: полоска под шапкой и счётчик у документа. */
  const progressDone = progress.filled + progress.norm;
  const progressPercent = progress.total > 0 ? (progressDone / progress.total) * 100 : 0;
  const progressLabel = t("conclusion.progress", { filled: progressDone, total: progress.total });
  /** Куда ведёт счётчик: к первой пустой строке, а если пустых нет — к нетронутой норме. */
  const progressTarget = firstEmptyRow ?? progress.firstNorm ?? null;
  const progressNode =
    progressRows.length > 0 ? (
      <Tooltip
        title={
          <>
            {progressLabel}
            {firstEmptyRow && <div>{t("conclusion.progressHint")}</div>}
            {progress.norm > 0 && (
              <div>
                {t("conclusion.progressNorm", { count: progress.norm })}.{" "}
                {t("conclusion.progressNormHint")}
              </div>
            )}
          </>
        }
      >
        <Box
          component="button"
          type="button"
          aria-label={progressLabel}
          onClick={() => progressTarget && focusRow(progressTarget)}
          sx={{
            flexShrink: 0,
            border: 0,
            bgcolor: "transparent",
            color: firstEmptyRow ? "primary.main" : "text.secondary",
            font: "inherit",
            fontSize: 12,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            px: 0.75,
            py: 0.5,
            borderRadius: 1,
            cursor: progressTarget ? "pointer" : "default",
            // Нетронутые нормы — пунктиром: карта с нормами выглядит почти
            // готовой, а врач их ещё не читал.
            textDecoration: progress.norm > 0 ? "underline dashed" : "none",
            textUnderlineOffset: 3,
            "&:hover": progressTarget ? { bgcolor: "action.hover" } : undefined,
            "&:focus-visible": { outline: 2, outlineColor: "primary.main" },
          }}
        >
          {progressDone}/{progress.total}
        </Box>
      </Tooltip>
    ) : null;

  const sheetPane = (
    <ConclusionSheetPane
      template={sheetTemplate}
      context={sheetContext}
      values={formParts?.sheetValues ?? EMPTY_VALUES}
      trailer={formParts?.trailer ?? EMPTY_VALUES}
      document={freeSheetDocument}
      highlightFieldId={readOnly ? null : focusedRow}
      onFieldClick={readOnly ? undefined : focusRow}
      saved={readOnly}
    />
  );

  /**
   * Подсказки AI в колонке слева от формы — по порядку формы. Колонка есть,
   * пока есть неразобранные подсказки и под неё хватает ширины.
   */
  const aiGutterItems =
    canAiAssist && aiGutterFits && ai.suggestedKeys.length > 0
      ? aiReviewTargets()
          .filter((target) => ai.of(target.key).suggestion)
          .map((target) => ({
            key: target.key,
            label: target.label,
            state: ai.of(target.key),
            current: target.current,
            onApply: () => applyAiSuggestion(target),
            onDismiss: () => dismissAiSuggestion(target),
          }))
      : [];
  // «Вернуть» держит колонку и после последней подсказки.
  const aiGutter = aiGutterItems.length > 0 || (canAiAssist && aiGutterFits && aiUndo != null);
  /** Пульт над колонкой: ожидание AI, «N правок · Применить все», «Все разобраны». */
  const aiGutterPult =
    canAiAssist && aiGutterMode && (ai.loading || aiGutter) ? (
      <AiGutterPult
        width={AI_GUTTER_WIDTH[aiGutterMode]}
        padLeft={AI_GUTTER_PAD_LEFT}
        padRight={AI_GUTTER_PAD_RIGHT}
        pendingCount={aiGutterItems.length}
        thinking={
          ai.loading ? <AiThinkingStrip fieldCount={ai.loadingCount} onCancel={ai.reset} /> : undefined
        }
        onStep={aiGutterMode === "focus" ? (dir) => aiGutterRef.current?.step(dir) : undefined}
        onApplyAll={handleAiApplyAll}
        onDismissAll={handleAiDismissAll}
      />
    ) : null;
  // Пока AI думает — рамки полей, которые он читает, мерцают.
  useAiFieldMarks(formColumnRef.current, ai.loadingKeys, "data-ai-loading");
  // Иконкой, как лист: шапка в одну строку, и подпись «Прошлые заключения»
  // вылезала из кнопки и сжимала меню документа до «С…». Включённая — заливкой.
  const historyToggleNode = canViewPatientHistory && historyPatientId != null ? (
    <Tooltip title={t("conclusion.patientHistory.trigger")}>
      <IconButton
        size="small"
        color={patientHistoryOpen ? "primary" : "default"}
        aria-pressed={patientHistoryOpen}
        aria-label={t("conclusion.patientHistory.trigger")}
        onClick={() => setPatientHistoryOpen((previous) => !previous)}
        sx={patientHistoryOpen ? { bgcolor: "action.selected" } : undefined}
      >
        <HistoryOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  ) : null;

  const content = (
    <>
      {/* ── header ── */}
      {readOnly ? (
        <Stack
          direction="row"
          alignItems={documentInHeader ? "center" : "flex-start"}
          justifyContent="space-between"
          columnGap={1}
          px={2}
          py={documentInHeader ? 1 : isMobile ? 1 : 1.5}
          sx={{ flexShrink: 0, minHeight: documentInHeader ? 52 : undefined }}
        >
          {/* Колонка кабинета: переключатель документов встаёт на место
              заголовка (08.10.2026) — «Заключение» над чипом «Амбулаторная
              карта…» и тем же названием в тексте ниже было тремя ярусами
              про одно и то же. */}
          {documentInHeader ? (
            <Box sx={{ minWidth: 0, flex: 1 }}>{documentBar}</Box>
          ) : (
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant={isMobile ? "subtitle1" : "h6"} lineHeight={1.3} fontWeight={600}>
              {t("conclusion.title")}
            </Typography>
            {/* Услуга/врач и время правки — только в дровере, не в
                inline-просмотре (там шапка чистая, как в оригинале). */}
            {!inline && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {serviceName} — {doctorName}
                </Typography>
                {lastUpdated && (
                  <Typography variant="caption" color="text.disabled">
                    Последнее изменение: {lastUpdated}
                  </Typography>
                )}
              </>
            )}
          </Stack>
          )}
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            {/* Лист в просмотре — документ, каким его напечатают. Без
                заключения показывать нечего. */}
            {conclusion && !showHistoryTab && sheetToggleNode}
            <IconButton onClick={onClose} size="small">
              <CloseOutlined />
            </IconButton>
          </Stack>
        </Stack>
      ) : (
        /* Правка — одна строка (08.10.2026, было ~112px в три яруса): кто на
           приёме и документ слева, действия справа. Статус документа уехал
           вниз к «Сохранено…», заполненность — в полоску под шапкой и счётчик
           рядом с документом. На телефоне документ — второй строкой. */
        <Stack
          direction="row"
          alignItems="center"
          columnGap={1}
          rowGap={0.75}
          flexWrap={isMobile ? "wrap" : "nowrap"}
          px={2}
          py={1}
          sx={{ flexShrink: 0, minHeight: 56, position: "relative" }}
        >
          {/* Имя — со своей шириной: с `flex: 1` (основа 0) длинное название
              бланка в меню документа съедало его целиком. */}
          <Box sx={{ minWidth: 72, flex: "1 1 auto" }}>
            <Typography variant="subtitle1" lineHeight={1.3} fontWeight={600} noWrap>
              {patientName
                ? [patientName, patientAge].filter(Boolean).join(", ")
                : conclusion
                  ? t("conclusion.editTitle")
                  : t("conclusion.newTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              {[serviceName, doctorName, visitDateTime].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
          <Stack
            direction="row"
            alignItems="center"
            gap={0.75}
            sx={{
              minWidth: 0,
              flex: "0 1 auto",
              maxWidth: isMobile ? "100%" : "45%",
              order: isMobile ? 3 : 0,
              width: isMobile ? "100%" : "auto",
            }}
          >
            {!showHistoryTab && <>
            <ConclusionDocumentMenu
              forms={selectableForms}
              form={attachedForm}
              onSelectForm={handleSelectForm}
              onFreeText={() => {
                if (attachedForm) handleDetachForm();
              }}
              templates={templates}
              onApplyTemplate={applyTemplate}
              onDeleteTemplate={(id) => void handleDeleteTemplate(id)}
              onSaveTemplate={() => {
                setTplName("");
                setSaveTplOpen(true);
              }}
              previous={previousConclusions}
              onApplyPrevious={(item) => void applyPrevious(item)}
              previousLoading={previousLoading}
              compact
            />
            {progressNode}
            </>}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            {/* AI — одна кнопка на все поля; в шапке, потому что она не
                прокручивается, а просят AI обычно дописав форму до низа. */}
            {canAiAssist && !showHistoryTab && (
              <AiAssistHeaderButton
                loading={ai.loading}
                fieldCount={ai.loadingCount}
                compact={isMobile}
                onClick={handleAiRequest}
              />
            )}
            {historyToggleNode}
            {!showHistoryTab && sheetToggleNode}
            <IconButton onClick={saving ? undefined : onClose} size="small">
              <CloseOutlined />
            </IconButton>
          </Stack>
          {/* Пульт подсказок AI — слева от шапки, над колонкой подсказок. */}
          {aiGutterPult}
        </Stack>
      )}
      {/* Полоска под шапкой — заполненность документа вместо разделителя. */}
      {!readOnly && progressRows.length > 0 ? (
        <LinearProgress
          variant="determinate"
          value={progressPercent}
          aria-label={progressLabel}
          sx={{ height: 2, flexShrink: 0, bgcolor: "divider" }}
        />
      ) : (
        <Divider />
      )}
      {/* Прошлое заключение догружается (карточка с formData): меню уже
          закрыто, и без полоски врач не видит, что нажатие сработало. */}
      {previousLoading && <LinearProgress sx={{ height: 2, flexShrink: 0 }} />}

      {/* ── документы строки услуги (если их несколько или можно добавить) ── */}
      {documentBar && !documentInHeader && !showHistoryTab && (
        <>
          {documentBar}
          <Divider />
        </>
      )}

      {/* ── AI думает: этапы и процент вместо полосы подсказок ── */}
      {canAiAssist && !showHistoryTab && ai.loading && !aiGutterFits && (
        <>
          <AiThinkingStrip fieldCount={ai.loadingCount} onCancel={ai.reset} />
          <Divider />
        </>
      )}

      {/* ── подсказки AI: массовые действия, пока есть неразобранные ── */}
      {/* С колонкой слева пульт — над ней (aiGutterPult), здесь полосы нет. */}
      {canAiAssist && !showHistoryTab && !ai.loading && !aiGutterFits && ai.suggestedKeys.length > 0 && (
        <>
          <AiAssistPendingStrip
            pendingCount={ai.suggestedKeys.length}
            onReview={handleAiReview}
            onApplyAll={handleAiApplyAll}
            onDismissAll={handleAiDismissAll}
          />
          <Divider />
        </>
      )}
      {canAiAssist && aiReview && (
        <AiReviewDialog
          open
          entries={aiReview}
          targets={aiReviewTargets()}
          onResolve={ai.dismiss}
          onClose={() => setAiReview(null)}
        />
      )}

      {/* ── body ── */}
      {/* Форма и лист. Лист стоит справа (дровер на широком экране) или
          вместо формы (телефон, колонка приёма); форма при этом не
          размонтируется — только прячется, чтобы не терять фокус и
          раскрытые поля. */}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
      {/* Подсказки AI — за левым краем дровера, по высоте формы. */}
      {aiGutter && (
        <AiSuggestionGutter
          ref={aiGutterRef}
          scrollEl={formColumnRef.current}
          items={aiGutterItems}
          undo={aiUndo}
          mode={aiGutterMode ?? "focus"}
        />
      )}
      {/* Скан по форме, пока AI думает (по ширине колонки формы). */}
      {canAiAssist && ai.loading && !showSheetTab && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: showSheetSide ? FORM_COLUMN_WIDTH : "100%",
            pointerEvents: "none",
          }}
        >
          <AiThinkingOverlay />
        </Box>
      )}
      <Box
        ref={formColumnRef}
        onFocus={handleFormFocus}
        sx={{
          flex: showHistorySide ? "0 0 52%" : showSheetSide ? `0 0 ${FORM_COLUMN_WIDTH}px` : 1,
          minWidth: 0,
          display: showSheetTab || showHistoryTab ? "none" : "block",
          overflowY: "auto",
          p: 2,
          minHeight: 0,
          borderRight: showSheetSide || showHistorySide ? 1 : 0,
          borderColor: "divider",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          // Поле, на чью подсказку в колонке наведён курсор.
          "& [data-ai-active]": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 4,
            borderRadius: 1,
          },
          // Поле, которое AI сейчас читает: рамка мерцает акцентом.
          "& [data-ai-loading] .MuiOutlinedInput-notchedOutline": {
            borderColor: "primary.main",
            borderWidth: 2,
            animation: `${aiFieldGlow} 1.6s ease-in-out infinite`,
            ...reducedMotion,
          },
        }}
      >
        <Stack spacing={3}>
          {/* error */}
          {(saveError) && (
            <Alert severity="error" onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}

          {/* read-only empty state */}
          {readOnly && !conclusion && (
            <Alert severity="info">
              {t("conclusion.noConclusionByDoctor")}
            </Alert>
          )}

          {/* ════════ READ-ONLY ПРОСМОТР (как в оригинале, фото 2) ════════ */}
          {readOnly && conclusion && (
            <Stack spacing={3}>
              {/* Витальные — карточки с разделителями. У заключения по бланку
                  показатели, если они есть, выводит ConclusionFormReadView. */}
              {!readOnlyFormParts && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
                <Stack direction="row" spacing={3} justifyContent="space-around">
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">{t("conclusion.weight")}</Typography>
                    <Typography variant="h6">{weightKg ? t("conclusion.weightWithUnit", { value: formatQuantity(weightKg) }) : "—"}</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">{t("conclusion.height")}</Typography>
                    <Typography variant="h6">{heightCm ? t("conclusion.heightWithUnit", { value: formatQuantity(heightCm) }) : "—"}</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">{t("conclusion.temperature")}</Typography>
                    <Typography
                      variant="h6"
                      color={parseFloat(temperature) > 37 ? "error.main" : "text.primary"}
                    >
                      {temperature ? `${formatQuantity(temperature)} °C` : "—"}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
              )}

              {/* Жалобы пациента (контекст) */}
              {showPatientComplaints && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("conclusion.patientComplaints")}
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                    {patientComplaints}
                  </Typography>
                </Box>
              )}

              {readOnlyFormParts && attachedForm ? (
                <ConclusionFormReadView
                  template={attachedForm}
                  values={readOnlyFormParts.sheetValues}
                  trailer={readOnlyFormParts.trailer}
                />
              ) : (
              <>
              {/* Диагноз — чипы */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t("conclusion.diagnosisIcd")}
                </Typography>
                {selectedDiagnoses.length > 0 ? (
                  <Box display="flex" gap={1} flexWrap="wrap">
                    {selectedDiagnoses.map((d, i) => (
                      <Chip
                        key={i}
                        label={d.code ? `${d.code} - ${d.title}` : d.title}
                        size="small"
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.disabled">{t("conclusion.notSpecified")}</Typography>
                )}
              </Box>

              <Divider />

              {complaints.trim() && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("conclusion.doctorComplaints")}
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{complaints}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t("conclusion.anamnesis")}</Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{anamnesis || "—"}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t("conclusion.objectively")}</Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{objective || "—"}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t("conclusion.title")}</Typography>
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: "pre-wrap",
                    fontWeight: 500,
                    color: conclusionText ? "text.primary" : "text.disabled",
                    fontStyle: conclusionText ? "normal" : "italic",
                  }}
                >
                  {conclusionText ||
                    t("conclusion.notFilled", {
                      filled: agree(term.conclusion.gender, ["заполнен", "заполнена", "заполнено"]),
                    })}
                </Typography>
              </Box>
              </>
              )}

              {internalComment.trim() && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("conclusion.internalComment")}
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{internalComment}</Typography>
                </Box>
              )}

              {/* Фотографии */}
              {photoUrls.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("conclusion.photos2")}
                  </Typography>
                  <Grid container spacing={1}>
                    {photoUrls.map((url) => (
                      <Grid item key={url}>
                        <Box
                          component="img"
                          src={url}
                          alt={t("conclusion.photos")}
                          onClick={() => setPreviewPhoto(url)}
                          sx={{
                            width: 72,
                            height: 72,
                            borderRadius: 1,
                            objectFit: "cover",
                            border: "1px solid",
                            borderColor: "divider",
                            cursor: "pointer",
                          }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}

              {/* Кто и когда правил заключение — грузится по требованию. */}
              <ConclusionHistory conclusionId={conclusion.id} />
            </Stack>
          )}

          {/* ════════ ФОРМА РЕДАКТИРОВАНИЯ (только при !readOnly) ════════ */}
          {/* Зоны документа — «Показатели», «Протокол», «Заключение и
              рекомендации» — и «Служебное» под ними (редизайн 28.09.2026).
              Раньше всё шло одной лентой с одинаковым весом, и внутренний
              комментарий читался как часть документа. */}
          {!readOnly && (
          <>
          {/* ── Показатели ── */}
          {/* Степпер, который забрал бланк, здесь не рисуем: он стоит в потоке
              его полей (см. slotNodes). При бланке оставшиеся степперы уходят в
              блок «Заполнено ранее» под протоколом; здесь секция нужна разве
              что для ошибки привязанного. */}
          {(topVitals.length > 0 ||
            (Boolean(vitals.errorOf("vitals")) && leftoverVitals.length === 0)) &&
            sectionNode(
              t("conclusion.sections.vitals"),
              null,
              <Paper ref={vitals.anchor("vitals")} variant="outlined" sx={{ p: 1.5 }}>
                {/* Три степпера в ряд на узком экране упираются в свою minWidth:
                    разрешаем перенос, иначе карточка выезжает вбок. */}
                <Stack direction="row" gap={1.5} flexWrap="wrap">
                  {topVitals.map((kind) => (
                    <React.Fragment key={kind}>{vitalNode(kind)}</React.Fragment>
                  ))}
                </Stack>
                {vitals.errorOf("vitals") && (
                  <Alert severity="error" sx={{ py: 0, mt: 1 }}>
                    {vitals.errorOf("vitals")}
                  </Alert>
                )}
              </Paper>,
            )}

          {/* ── Протокол ── */}
          {sectionNode(
            t("conclusion.sections.protocol"),
            attachedForm ? t("conclusion.sections.byForm", { name: attachedForm.name }) : null,
            <Stack spacing={2}>
              {/* ── patient complaints (read-only context) ── */}
              {showPatientComplaints && (
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    {t("conclusion.patientComplaints")}
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {patientComplaints}
                    </Typography>
                  </Paper>
                </Stack>
              )}

              {/* ── поля бланка ── */}
              {/* Пустой протокол — это незаполненное заключение, поэтому при
                  «Завершить» скролл и фокус ведут сюда, к строкам бланка. */}
              {(attachedForm || formsQuery.isLoading) && (
                <Box
                  ref={
                    managedByForm("conclusion") || !slotFree("conclusion")
                      ? completion.anchor("conclusionText")
                      : undefined
                  }
                >
                  <ConclusionFormInline
                    loading={formsQuery.isLoading}
                    form={attachedForm}
                    values={formValues}
                    onChangeValue={setFormRowValue}
                    rowAddon={
                      canAiAssist
                        ? (field) =>
                            aiSuggestionNode(aiRowKey(field.id))
                        : undefined
                    }
                    // Строка с подсказкой — во всю ширину, и когда подсказка в
                    // колонке слева: две половинные строки рядом дали бы две
                    // карточки на одной высоте.
                    rowExpanded={
                      canAiAssist
                        ? (field) => ai.of(aiRowKey(field.id)).suggestion != null
                        : undefined
                    }
                    slotNodes={slotNodes}
                    disabled={readOnly}
                    defaults={attachedFormDefaults}
                    onResetRow={(fieldId) =>
                      setFormRowValue(fieldId, attachedFormDefaults[fieldId] ?? "")
                    }
                  />
                  {/* Строка бланка, привязанная к «Заключению», сама ошибку не
                      показывает (её узел собирается до проверки — см. slotNodes):
                      без этой плашки «Завершить» молча ничего не делал. */}
                  {!slotFree("conclusion") && completion.errorOf("conclusionText") && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {completion.errorOf("conclusionText")}
                    </Alert>
                  )}
                </Box>
              )}

              {/* ── doctor complaints ── */}
              {/* Поле, забранное бланком, здесь не рисуем: оно стоит в потоке его
                  полей (slotNodes) — иначе врач вводил бы жалобы дважды. Под
                  бланком без такой строки штатного поля тоже нет (standardShown):
                  документ — это поля бланка. */}
              {standardShown("complaints") &&
                !isLeftover("complaints") &&
                textFieldNode(t("conclusion.doctorComplaints"), complaints, setComplaints, {
                  aiField: "complaints",
                  rowId: "complaints",
                })}

              {/* ── anamnesis ── */}
              {standardShown("anamnesis") &&
                !isLeftover("anamnesis") &&
                (managedByForm("anamnesis")
                  ? projectionNode(t("conclusion.anamnesis"), anamnesis, null)
                  : textFieldNode(t("conclusion.anamnesis"), anamnesis, setAnamnesis, {
                      minRows: 3,
                      aiField: "anamnesis",
                      rowId: "anamnesis",
                    }))}

              {/* ── objective ── */}
              {standardShown("objective") &&
                !isLeftover("objective") &&
                (managedByForm("objective")
                  ? projectionNode(t("conclusion.objectively"), objective, null)
                  : textFieldNode(t("conclusion.objectively"), objective, setObjective, {
                      minRows: 3,
                      aiField: "objective",
                      rowId: "objective",
                    }))}

              {/* ── diagnosis (catalog multi-select + free text) ── */}
              {/* Поле, забранное бланком, здесь не рисуем: оно стоит в потоке его
                  полей (slotNodes) — иначе врач выбирал бы диагноз дважды. */}
              {standardShown("diagnosis") &&
                !isLeftover("diagnosis") &&
                diagnosisNode(undefined, "diagnosis")}

              {/* Бланк собирает текст не в «Заключение» (карта гинеколога пишет
                  в «Анамнез»): дописанное врачом — часть протокола, а не вывода. */}
              {attachedForm && attachedForm.target !== "conclusion" && manualNode(true)}

              {/* ── заполнено ранее: колонки с текстом, которых в бланке нет ── */}
              {leftoverSlots.length > 0 && (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>
                          Заполнено ранее — в бланке таких строк нет
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Выйдет на печать отдельно, под строками бланка. Не нужно — очистите.
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        color="inherit"
                        startIcon={<DeleteOutline />}
                        onClick={clearLeftovers}
                        sx={{ flexShrink: 0 }}
                      >
                        Очистить
                      </Button>
                    </Stack>

                    {leftoverVitals.length > 0 && (
                      <Box ref={vitals.anchor("vitals")}>
                        <Stack direction="row" gap={1.5} flexWrap="wrap">
                          {leftoverVitals.map((kind) => (
                            <React.Fragment key={kind}>{vitalNode(kind)}</React.Fragment>
                          ))}
                        </Stack>
                        {vitals.errorOf("vitals") && (
                          <Alert severity="error" sx={{ py: 0, mt: 1 }}>
                            {vitals.errorOf("vitals")}
                          </Alert>
                        )}
                      </Box>
                    )}
                    {isLeftover("complaints") &&
                      textFieldNode(t("conclusion.doctorComplaints"), complaints, setComplaints, {
                        aiField: "complaints",
                      })}
                    {isLeftover("anamnesis") &&
                      textFieldNode(t("conclusion.anamnesis"), anamnesis, setAnamnesis, {
                        minRows: 3,
                        aiField: "anamnesis",
                      })}
                    {isLeftover("objective") &&
                      textFieldNode(t("conclusion.objectively"), objective, setObjective, {
                        minRows: 3,
                        aiField: "objective",
                      })}
                    {isLeftover("diagnosis") && diagnosisNode()}
                  </Stack>
                </Paper>
              )}
            </Stack>,
          )}

          {/* ── Заключение и рекомендации ── */}
          {/* Забрать заключение в поток бланка можно (slot "conclusion"), но
              обязательным оно остаётся: секцию скрываем только когда бланк его
              правда рисует, иначе врачу негде выполнить требование «*». */}
          {slotFree("conclusion") &&
            sectionNode(
              // Без бланка поле обязательно для «Завершить» — звёздочка, как
              // была в подписи поля до разбиения на зоны.
              managedByForm("conclusion")
                ? t("conclusion.sections.result")
                : `${t("conclusion.sections.result")} *`,
              null,
              // Бланк собирает это поле сам — врач пишет вывод в «Дополнительно»,
              // а собранный итог виден сворачиваемым блоком. Якорь валидации при
              // этом уезжает на строки бланка (см. ref над ConclusionFormInline):
              // иначе «Завершить» с пустым протоколом ругался бы в никуда.
              managedByForm("conclusion") ? (
                <Stack spacing={1}>
                  {manualNode(false)}
                  {projectionNode(
                    t("conclusion.conclusionRequired"),
                    conclusionText,
                    completion.errorOf("conclusionText"),
                  )}
                </Stack>
              ) : (
                <Stack spacing={0.5} data-conclusion-row="conclusion" data-ai-key="conclusion">
                  <CollapsibleTextField
                    value={conclusionText}
                    onChange={(e) => setConclusionText(e.target.value)}
                    disabled={readOnly}
                    minRows={4}
                    fullWidth
                    size="small"
                    placeholder={t("conclusion.text")}
                    {...completion.field("conclusionText", "")}
                  />
                  {aiSuggestionNode("conclusion")}
                </Stack>
              ),
            )}

          {/* ── Служебное: для коллег, не для пациента ── */}
          {/* Отдельной подложкой, чтобы не путать с документом: ни комментарий,
              ни фото на печать не выходят. Пустое — свёрнуто в одну кнопку. */}
          <Box component="section" sx={{ bgcolor: (th) => subtleBg(th), borderRadius: 2, p: 1.5 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" columnGap={1} rowGap={0.25} flexWrap="wrap">
                <Typography variant="caption" sx={SECTION_TITLE_SX}>
                  {t("conclusion.sections.service")}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: "text.secondary" }}>
                  <LockOutlined sx={{ fontSize: 14 }} />
                  <Typography variant="caption">{t("conclusion.sections.serviceHint")}</Typography>
                </Stack>
              </Stack>

              {serviceExpanded ? (
                <>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t("conclusion.internalComment")}
                    </Typography>
                    <CollapsibleTextField
                      value={internalComment}
                      onChange={(e) => setInternalComment(e.target.value)}
                      disabled={readOnly}
                      minRows={2}
                      fullWidth
                      size="small"
                      placeholder={t("conclusion.optional")}
                    />
                  </Stack>

                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t("conclusion.photos2")}
                    </Typography>
                    <Stack direction="row" gap={1} flexWrap="wrap">
                      {photoUrls.map((url) => (
                        <Box
                          key={url}
                          sx={{
                            position: "relative",
                            width: 72,
                            height: 72,
                            borderRadius: 1,
                            overflow: "hidden",
                            border: 1,
                            borderColor: "divider",
                          }}
                        >
                          <Box
                            component="img"
                            src={url}
                            alt={t("conclusion.photos")}
                            onClick={() => setPreviewPhoto(url)}
                            sx={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              cursor: "pointer",
                            }}
                          />
                          <IconButton
                            size="small"
                            aria-label={t("conclusion.deletePhoto")}
                            onClick={() => removePhoto(url)}
                            sx={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              p: 0.25,
                              bgcolor: "background.paper",
                              border: 1,
                              borderColor: "divider",
                              "&:hover": { bgcolor: "background.paper" },
                            }}
                          >
                            <DeleteOutline sx={{ fontSize: 14 }} color="error" />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        component="label"
                        variant="outlined"
                        disabled={uploadingPhoto}
                        sx={{
                          width: 72,
                          height: 72,
                          minWidth: 0,
                          p: 0,
                          borderStyle: "dashed",
                        }}
                      >
                        {uploadingPhoto ? (
                          <CircularProgress size={20} />
                        ) : (
                          <AddPhotoAlternateOutlined fontSize="small" />
                        )}
                        <input
                          type="file"
                          hidden
                          multiple
                          accept={PHOTO_ACCEPT}
                          onChange={handlePhotoUpload}
                        />
                      </Button>
                    </Stack>
                  </Stack>
                </>
              ) : (
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<AddOutlined />}
                  onClick={() => setServiceOpen(true)}
                  sx={{ alignSelf: "flex-start", color: "text.secondary" }}
                >
                  {t("conclusion.sections.serviceAdd")}
                </Button>
              )}
            </Stack>
          </Box>
          </>
          )}

          {/* ── print (в inline-режиме кнопки уже в шапке) ── */}
          {!inline && canPrint && conclusion && (
            <Stack direction="row" spacing={1}>
              {/* Одна кнопка на весь документ — см. openPrint. */}
              <Button size="small" variant="outlined" onClick={openPrint}>
                {t("conclusion.print")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  window.open(
                    `/print/certificate/${conclusion.appointmentId}?lineId=${serviceLineId}&conclusionId=${conclusion.id}`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                {t("conclusion.certificate")}
              </Button>
            </Stack>
          )}
        </Stack>
      </Box>
      {(showSheetSide || showSheetTab) && (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: "auto",
            p: { xs: 1.5, md: 2.5 },
            bgcolor: (th) => subtleBg(th),
          }}
        >
          {sheetPane}
        </Box>
      )}
      {patientHistoryOpen && canViewPatientHistory && historyPatientId != null && (
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <PatientConclusionHistoryPanel key={historyPatientId}
            patientId={historyPatientId} currentAppointmentId={appointmentId}
            onClose={() => setPatientHistoryOpen(false)} />
        </Box>
      )}
      </Box>

      {/* ── inline-просмотр: действия внизу колонки (08.10.2026) ──
          Раньше ряд стоял под шапкой и делал верх тяжёлым. Внизу он — своя
          строка раскладки, а не наложение поверх текста: прокрутка кончается
          над ним, и история правок в конце заключения не прячется.
          Главное — «Изменить» (залито), печать и справка — вторичные. */}
      {inline && readOnly && !showHistoryTab && (onStartEdit || (canPrint && conclusion)) && (
        <>
          <Divider />
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            sx={{
              px: 2,
              py: 1,
              pb: isMobile ? "calc(8px + env(safe-area-inset-bottom))" : 1,
              gap: 1,
              flexShrink: 0,
              bgcolor: "background.paper",
            }}
          >
            {onStartEdit && (
              <Button
                size="small"
                variant="contained"
                disableElevation
                startIcon={<EditOutlined />}
                onClick={onStartEdit}
                sx={{ whiteSpace: "nowrap" }}
              >
                {t("conclusion.editConclusion")}
              </Button>
            )}
            {canPrint && conclusion && (
              <>
                {/* Одна кнопка на весь документ — страница печати сама решает,
                    печатать лист бланка с хвостом или штатное заключение. */}
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<PrintOutlined />}
                  onClick={openPrint}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {t("conclusion.print")}
                </Button>
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<ArticleOutlined />}
                  onClick={() =>
                    window.open(
                      `/print/certificate/${conclusion.appointmentId}?lineId=${serviceLineId}&conclusionId=${conclusion.id}`,
                      "_blank",
                      "noopener",
                    )
                  }
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {t("conclusion.certificate")}
                </Button>
              </>
            )}
          </Stack>
        </>
      )}

      {/* ── footer ── (в inline-просмотре скрыт: закрытие — крестиком в шапке) */}
      {!(inline && readOnly) && !showHistoryTab && (
      <>
      <Divider />
      {/* Одна строка (08.10.2026, было ~97px): слева — статус документа и где
          лежит последняя правка, справа — кнопки. В колонке приёма (~420px) и
          на телефоне подпись не помещается рядом с кнопками (сжималась до
          «С…» и выталкивала «Завершить») — там она остаётся строкой над ними,
          а метки кнопок короче. «Сохранить и печать» — иконкой везде. */}
      <Stack
        direction={compactFooter ? "column" : "row"}
        alignItems={compactFooter ? "stretch" : "center"}
        gap={compactFooter ? 0.75 : 1}
        sx={{
          px: 2,
          py: 1,
          pb: isMobile ? "calc(8px + env(safe-area-inset-bottom))" : 1,
          minHeight: compactFooter ? undefined : 52,
          flexShrink: 0,
        }}
      >
        {!readOnly && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            title={footerState}
            sx={{
              minWidth: 0,
              flex: compactFooter ? undefined : 1,
              justifyContent: compactFooter ? "flex-end" : "flex-start",
            }}
          >
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                flexShrink: 0,
                bgcolor:
                  statusChip.color === "default" ? "text.disabled" : `${statusChip.color}.main`,
              }}
            />
            <Typography variant="caption" color="text.secondary" noWrap>
              {footerState}
            </Typography>
          </Stack>
        )}
        {/* flexWrap — страховка для крупного масштаба интерфейса: ряд с
            nowrap-метками иначе выехал бы за край узкого экрана. */}
        <Stack
          direction="row"
          gap={1}
          flexWrap="wrap"
          justifyContent="flex-end"
          alignItems="center"
          sx={{ flexShrink: 0, ml: readOnly ? "auto" : undefined }}
        >
          <Button
            onClick={saving ? undefined : onClose}
            disabled={saving}
            size="small"
            color="inherit"
            sx={{ whiteSpace: "nowrap", color: "text.secondary" }}
          >
            {readOnly ? t("conclusion.close") : t("conclusion.cancel")}
          </Button>
          {!readOnly && (
            <>
              {/* В правке печать идёт через сохранение: на бумагу должно уйти
                  ровно то, что легло в карту (см. handleSaveAndPrint). */}
              {canPrint && conclusion && (
                <Tooltip title={t("conclusion.saveAndPrint")}>
                  <span>
                    <IconButton
                      color="primary"
                      disabled={saving}
                      onClick={handleSaveAndPrint}
                      aria-label={t("conclusion.saveAndPrint")}
                      size="small"
                      sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
                    >
                      <PrintOutlined fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <Tooltip title={t("conclusion.saveDraft")}>
                <span>
                  <Button
                    variant="outlined"
                    disabled={saving}
                    size="small"
                    onClick={() => handleSave("draft")}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("conclusion.saveDraftShort")}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={isMobile ? "" : t("conclusion.completeHotkey")}>
                <span>
                  <Button
                    variant="contained"
                    color="success"
                    disableElevation
                    disabled={saving}
                    size="small"
                    onClick={() => requestSave("completed", false)}
                    startIcon={
                      saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />
                    }
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("conclusion.complete")}
                  </Button>
                </span>
              </Tooltip>
            </>
          )}
        </Stack>
      </Stack>
      </>
      )}

      {/* Знакомство с предварительным просмотром — один раз на браузер. */}
      <Popper
        open={showPreviewCoach}
        anchorEl={sheetButtonEl}
        placement="bottom-end"
        modifiers={[{ name: "offset", options: { offset: [8, 10] } }]}
        sx={{ zIndex: (th) => th.zIndex.modal + 1 }}
      >
        <Box
          role="dialog"
          aria-label={t("conclusion.sheet.coachTitle")}
          sx={{
            position: "relative",
            width: 280,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            animation: `${aiCardIn} 220ms ease-out both`,
            ...reducedMotion,
            // Стрелка на кнопку.
            "&::before": {
              content: '""',
              position: "absolute",
              top: -6,
              right: 16,
              border: "6px solid transparent",
              borderTop: 0,
              borderBottomColor: (th) => th.palette.primary.main,
            },
          }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {t("conclusion.sheet.coachTitle")}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.92 }}>
            {t("conclusion.sheet.coachText")}
          </Typography>
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={dismissPreviewCoach}
              sx={{ borderColor: "currentColor" }}
            >
              {t("conclusion.sheet.coachOk")}
            </Button>
          </Stack>
        </Box>
      </Popper>

      {/* ── смена бланка поверх текста врача ── */}
      <Dialog
        open={pendingFormSwitch != null}
        onClose={() => setPendingFormSwitch(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {pendingFormSwitch?.columnText != null
            ? `Заменить текст в «${TARGET_LABELS[pendingFormSwitch.form.target]}»?`
            : "Сменить бланк?"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {pendingFormSwitch?.columnText != null
              ? `Бланк «${pendingFormSwitch.form.name}» собирает это поле из своих строк. Текст, который там сейчас, можно сохранить в «Дополнительно» — он допишется в конце.`
              : `Заполненные строки бланка «${attachedForm?.name ?? ""}» сбросятся, вместо них будут строки бланка «${pendingFormSwitch?.form.name ?? ""}».`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPendingFormSwitch(null)}>
            Отмена
          </Button>
          {pendingFormSwitch?.columnText != null && (
            <Button
              color="inherit"
              onClick={() => {
                const pending = pendingFormSwitch;
                setPendingFormSwitch(null);
                if (pending) applySelectForm(pending.form);
              }}
            >
              Заменить
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => {
              const pending = pendingFormSwitch;
              setPendingFormSwitch(null);
              if (pending) applySelectForm(pending.form, pending.columnText ?? undefined);
            }}
          >
            {pendingFormSwitch?.columnText != null ? "Сохранить в «Дополнительно»" : "Сменить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── заготовка поверх написанного ── */}
      <Dialog
        open={pendingPreset != null}
        onClose={() => setPendingPreset(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("conclusion.presetConfirm.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("conclusion.presetConfirm.text")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPendingPreset(null)}>
            {t("conclusion.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const preset = pendingPreset;
              setPendingPreset(null);
              if (preset) applyPresetNow(preset);
            }}
          >
            {t("conclusion.presetConfirm.apply")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── завершение без диагноза ── */}
      <Dialog
        open={confirmNoDiagnosis != null}
        onClose={() => setConfirmNoDiagnosis(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("conclusion.noDiagnosisTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("conclusion.noDiagnosisText", {
              selected: agree(term.diagnosis.gender, ["выбран", "выбрана", "выбрано"]),
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmNoDiagnosis(null);
              diagnosisAnchorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
          >
            {t("conclusion.noDiagnosisAdd")}
          </Button>
          <Button
            color="inherit"
            disabled={saving}
            onClick={() => {
              const pending = confirmNoDiagnosis;
              setConfirmNoDiagnosis(null);
              if (pending) void runSave("completed", pending.print);
            }}
          >
            {t("conclusion.noDiagnosisSkip")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── save-as-template dialog ── */}
      <Dialog
        open={saveTplOpen}
        onClose={() => !tplBusy && setSaveTplOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("conclusion.saveTemplateTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            fullWidth
            autoFocus
            placeholder={t("conclusion.templateNamePlaceholder")}
            disabled={tplBusy}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveTplOpen(false)} disabled={tplBusy}>
            {t("conclusion.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveTemplate}
            disabled={tplBusy || !tplName.trim()}
            startIcon={
              tplBusy ? <CircularProgress size={16} color="inherit" /> : undefined
            }
          >
            {t("conclusion.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── photo preview modal ── */}
      <Modal open={!!previewPhoto} onClose={() => setPreviewPhoto(null)}>
        <Box
          onClick={() => setPreviewPhoto(null)}
          sx={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.85)",
          }}
        >
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              setPreviewPhoto(null);
            }}
            sx={{
              position: "absolute",
              top: 20,
              right: 20,
              color: "white",
              bgcolor: "rgba(255,255,255,0.1)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
            }}
          >
            <CloseOutlined />
          </IconButton>
          {previewPhoto && (
            <Box
              component="img"
              src={previewPhoto}
              onClick={(e) => e.stopPropagation()}
              sx={{
                maxWidth: "90vw",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: 1,
              }}
            />
          )}
        </Box>
      </Modal>
    </>
  );

  // Встроенный режим — рендер в колонке (без Drawer), как в оригинале.
  if (inline) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onKeyDown={handleHotkeys}
      >
        {content}
      </Box>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={saving ? undefined : onClose}
      PaperProps={{
        onKeyDown: handleHotkeys,
        sx: {
          // С листом справа дровер шире ровно на лист: колонка формы остаётся
          // прежней ширины (FORM_COLUMN_WIDTH), лист занимает остальное.
          width: showHistorySide
            ? "min(1080px, calc(100vw - 32px))"
            : showSheetSide
            ? `min(${SHEET_DRAWER_MAX_WIDTH}px, calc(100vw - 48px))`
            : { xs: "100vw", sm: 520, md: DRAWER_WIDTH_MD },
          transition: (th) =>
            th.transitions.create("width", { duration: th.transitions.duration.shorter }),
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          // Подсказки AI висят за левым краем дровера — не обрезаем их.
          overflow: aiGutter || aiGutterPult ? "visible" : "hidden",
        },
      }}
    >
      {content}
    </Drawer>
  );
};

export default DjangoConclusionDrawer;
