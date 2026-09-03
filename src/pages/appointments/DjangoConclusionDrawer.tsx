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
  ListItemText,
  Menu,
  MenuItem,
  Modal,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import { useNotification } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { useFormValidation } from "../../hooks/useFormValidation";
import {
  useAppointmentReceipt,
  useReceiptAvailable,
} from "../../components/appointments/useAppointmentReceipt";
import InvoiceFormatDialog from "../../components/appointments/InvoiceFormatDialog";
import type { InvoicePageSize } from "../../components/appointments/appointmentInvoice";
import { formatQuantity, trimDecimalInput } from "../../utility/format";
import { PHOTO_ACCEPT } from "../../utility/imageCompression";
import { useT } from "../../i18n/VerticalProvider";
import { tt } from "../../i18n/t";
import { agree } from "../../i18n/formatters";
import { ConclusionFormInline } from "../../components/conclusion-forms/ConclusionFormInline";
import type { SheetContext } from "../../components/conclusion-forms/FormSheet";
import { generateFormSheetPdf } from "../../components/conclusion-forms/printFormSheet";
import { loadDjangoPrintData } from "../print/djangoPrintData";
import {
  getConclusionForms,
  renderFilledForm,
  type ConclusionFormTemplate,
  type FormFieldSlot,
  type FormTarget,
} from "../../api/conclusionForms";
import {
  readConclusionFormDefaults,
  resolveDefaultFormId,
} from "../../api/conclusionFormDefaults";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";

import {
  upsertConclusion,
  updateConclusion,
  getConclusionSlots,
  findReplacementSlot,
  isServiceLineGoneError,
  getDiagnoses,
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
} from "../../api/medical";

// ── types ──────────────────────────────────────────────────────────────────────

export type DjangoConclusionDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** null = creating new via upsert */
  conclusion: MedicalConclusion | null;
  serviceLineId: number;
  serviceName: string;
  /**
   * Услуга строки. Нужна, чтобы найти строку заново, если её пересоздали
   * правкой приёма, пока форма была открыта (см. handleSave).
   */
  serviceId?: number | null;
  doctorName: string;
  /** Приём, к которому относится строка услуги — нужен бланкам (шапка листа). */
  appointmentId?: number;
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

// ── localStorage draft persistence ─────────────────────────────────────────────
// Черновик заключения хранится локально: 1 заключение (строка услуги) =
// 1 запись в localStorage. Восстанавливается при повторном открытии и
// удаляется после успешного сохранения на сервере.

const conclusionDraftKey = (serviceLineId: number) =>
  `conclusion_draft_${serviceLineId}`;

type ConclusionDraftBody = {
  complaints: string;
  anamnesis: string;
  objective: string;
  conclusionText: string;
  selectedDiagnoses: CatalogDiagnosis[];
  photoUrls: string[];
  weightKg: string;
  heightCm: string;
  temperature: string;
  internalComment: string;
  status: ConclusionStatus;
  /**
   * Прикреплённый бланк и значения его полей.
   *
   * ⚠ Живут только в локальном черновике: у заключения на бэке поля под них
   * нет (`formData` запрошен тикетом backend_ticket_conclusion_form_data.md).
   * Поэтому до сохранения врач может закрыть дровер и вернуться к своим полям,
   * а после сохранения на сервере остаётся собранный текст — при повторном
   * открытии бланк не прикреплён. Разбирать текст обратно в поля не пытаемся:
   * на любой ручной правке такой разбор врёт.
   *
   * ⚠ Когда `formData` появится, привязки полей (`slot`) нужно читать из
   * снапшота бланка внутри самого заключения, а не из текущего бланка:
   * администратор мог переназначить слот позже, и тогда старое заключение
   * записало бы значение в чужую колонку.
   */
  formId?: number | null;
  formValues?: Record<string, string>;
  /** Свободный хвост бланка (см. manualText в компоненте). */
  formManual?: string;
};

/** Поле формы, в которое бланк собирает свой текст. */
const targetField = (target: FormTarget): keyof ConclusionDraftBody =>
  target === "anamnesis" ? "anamnesis" : target === "objective" ? "objective" : "conclusionText";

type ConclusionDraft = ConclusionDraftBody & { savedAt: string };

function readConclusionDraft(serviceLineId: number): ConclusionDraft | null {
  try {
    const raw = window.localStorage.getItem(conclusionDraftKey(serviceLineId));
    return raw ? (JSON.parse(raw) as ConclusionDraft) : null;
  } catch {
    return null;
  }
}

function writeConclusionDraft(serviceLineId: number, body: ConclusionDraftBody) {
  try {
    window.localStorage.setItem(
      conclusionDraftKey(serviceLineId),
      JSON.stringify({ ...body, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* localStorage переполнен или недоступен — работаем без черновика */
  }
}

function clearConclusionDraft(serviceLineId: number) {
  try {
    window.localStorage.removeItem(conclusionDraftKey(serviceLineId));
  } catch {
    /* ignore */
  }
}

// ── vitals validation helpers ──────────────────────────────────────────────────

// Контракт точности — как у бэка: вес numeric(6,3), рост numeric(5,2),
// температура numeric(4,1). Лишние знаки ловим на клиенте, чтобы врач получил
// понятную ошибку на родном языке, а не HTTP 400 от Django.
const WEIGHT_DECIMALS = 3;
const HEIGHT_DECIMALS = 2;
const TEMPERATURE_DECIMALS = 1;

function decimalPlacesOf(raw: string): number {
  // Поле type="number" отдаёт value с точкой независимо от локали.
  return raw.trim().split(".")[1]?.length ?? 0;
}

function validateVitals(
  weight: string,
  height: string,
  temp: string,
): string | null {
  if (weight.trim()) {
    const w = Number(weight);
    if (isNaN(w) || w < 1 || w > 999)
      return tt("appointments:conclusion.errors.weightRange");
    if (decimalPlacesOf(weight) > WEIGHT_DECIMALS)
      return tt("appointments:conclusion.errors.weightPrecision");
  }
  if (height.trim()) {
    const h = Number(height);
    if (isNaN(h) || h < 1 || h > 999)
      return tt("appointments:conclusion.errors.heightRange");
    if (decimalPlacesOf(height) > HEIGHT_DECIMALS)
      return tt("appointments:conclusion.errors.heightPrecision");
  }
  if (temp.trim()) {
    const t = Number(temp);
    if (isNaN(t) || t < 34 || t > 42)
      return tt("appointments:conclusion.errors.temperatureRange");
    if (decimalPlacesOf(temp) > TEMPERATURE_DECIMALS)
      return tt("appointments:conclusion.errors.temperaturePrecision");
  }
  return null;
}

// ── vital stepper (как renderQuantityInput в оригинале) ─────────────────────────

const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
  "& input[type=number]::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

type VitalStepperProps = {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  // Сколько знаков после запятой хранит бэк для этого показателя.
  decimalPlaces?: number;
  disabled?: boolean;
};

const VitalStepper: React.FC<VitalStepperProps> = ({
  label,
  suffix,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  decimalPlaces = WEIGHT_DECIMALS,
  disabled,
}) => {
  // Кнопки ± не должны ни плодить хвост вида 5.6000000000000005, ни выходить
  // за точность бэка — округляем до неё же.
  const k = 10 ** decimalPlaces;
  const fmt = (n: number) => String(Math.round(n * k) / k);
  const dec = () => {
    // Пустое поле — «не измеряли»: минус не должен подставлять туда минимум.
    if (value === "") return;
    const cur = parseFloat(value) || 0;
    onChange(fmt(Math.max(min, cur - step)));
  };
  const inc = () => {
    // Первый плюс на пустом поле ставит нижнюю границу (1 кг, 34 °C), а не шаг.
    if (value === "") {
      onChange(fmt(min));
      return;
    }
    const next = (parseFloat(value) || 0) + step;
    if (max !== undefined && next > max) return;
    onChange(fmt(next));
  };

  return (
    <Stack spacing={0.5} sx={{ minWidth: 100, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}, {suffix}
      </Typography>
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 40,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Button
          size="small"
          onClick={dec}
          disabled={disabled}
          sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
        >
          −
        </Button>
        <TextField
          size="small"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          inputProps={{
            style: { textAlign: "center", padding: "8px 4px" },
            min,
            // HTML-step = минимальная единица хранения бэка (0.001 кг и т.п.):
            // любое допустимое для бэка значение — её кратное, поэтому ручной
            // ввод 5,5 кг / 57,5 см не даёт stepMismatch, как давал бы шаг
            // кнопок ±1; а 4-й знак после запятой браузер уже подсветит.
            step: String(10 ** -decimalPlaces),
            max,
          }}
          sx={{
            flex: 1,
            ...noSpinnersSx,
            "& .MuiOutlinedInput-root": { "& fieldset": { border: "none" } },
          }}
        />
        <Button
          size="small"
          onClick={inc}
          disabled={disabled}
          sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
        >
          +
        </Button>
      </Box>
    </Stack>
  );
};

// ── component ──────────────────────────────────────────────────────────────────

const DjangoConclusionDrawer: React.FC<DjangoConclusionDrawerProps> = ({
  open,
  onClose,
  conclusion,
  serviceLineId,
  serviceName,
  serviceId,
  doctorName,
  appointmentId,
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

  // ── чек (лист A5) ─────────────────────────────────────────────────────────
  // Печатается по всему приёму, а не по строке услуги: касса принимает оплату
  // за визит целиком.
  const { printReceipt, pending: receiptPending } = useAppointmentReceipt();
  const receiptAppointmentId = appointmentId ?? conclusion?.appointmentId ?? null;
  // До оплаты чека нет: врач заполняет заключение раньше кассы, и печатать
  // бланк с нулями пациенту нельзя.
  const receiptAvailable = useReceiptAvailable(receiptAppointmentId, open);
  // Лист выбираем перед печатью: A5 — кассовый чек, A4 — счёт на руки.
  const [receiptFormatOpen, setReceiptFormatOpen] = React.useState(false);
  const handlePrintReceipt = async (pageSize: InvoicePageSize) => {
    setReceiptFormatOpen(false);
    if (receiptAppointmentId == null) return;
    try {
      const result = await printReceipt(receiptAppointmentId, pageSize);
      if (result === "blocked") {
        notify?.({ type: "error", message: t("invoice.popupBlocked") });
      }
    } catch {
      notify?.({ type: "error", message: t("conclusion.receiptError") });
    }
  };

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
  const [tplAnchor, setTplAnchor] = React.useState<null | HTMLElement>(null);
  const [saveTplOpen, setSaveTplOpen] = React.useState(false);
  const [tplName, setTplName] = React.useState("");
  const [tplBusy, setTplBusy] = React.useState(false);
  // Бланки: конструктор печатных форм (Настройки → Бланки заключений).
  // Прикреплённый бланк и значения его полей — поля стоят прямо в дровере, а
  // целевое текстовое поле собирается из них (см. ConclusionFormInline).
  const [formId, setFormId] = React.useState<number | null>(null);
  const [formValues, setFormValues] = React.useState<Record<string, string>>({});
  /**
   * Свободный хвост бланка: вывод и рекомендации, которых в строках нет.
   * Держим отдельно от собранного текста — иначе его пришлось бы вырезать из
   * проекции при каждой правке значений.
   */
  const [manualText, setManualText] = React.useState("");
  /** Итог, собранный бланком, по умолчанию свёрнут: он дублирует поля выше. */
  const [projectionOpen, setProjectionOpen] = React.useState(false);
  const [formPrinting, setFormPrinting] = React.useState(false);
  const [formPrintError, setFormPrintError] = React.useState<string | null>(null);
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
    serviceLineId,
    conclusion?.id ?? 0,
    conclusion?.updatedAt ?? "",
  ].join("|");

  // ── populate from existing conclusion / local draft ───────────────────────
  React.useEffect(() => {
    if (!open) {
      // Закрыли до срабатывания отложенной записи — дописываем черновик.
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(serviceLineId, pendingDraftRef.current);
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
      hydratedRef.current = false;
      draftNotifiedRef.current = false;
      return;
    }

    // Несохранённый черновик из localStorage приоритетнее серверных данных,
    // если он свежее последнего сохранения на сервере.
    const draft = readOnly ? null : readConclusionDraft(serviceLineId);
    const draftIsFresh =
      !!draft &&
      (!conclusion?.updatedAt ||
        !draft.savedAt ||
        dayjs(draft.savedAt).isAfter(dayjs(conclusion.updatedAt)));
    if (draft && !draftIsFresh) clearConclusionDraft(serviceLineId);

    if (draft && draftIsFresh) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { savedAt: _savedAt, ...body } = draft;
      applyDraftBody(body);
      baselineRef.current = JSON.stringify(body);
      hydratedRef.current = true;
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
          // Сохранённое заключение хранит только собранный текст: значений
          // полей бланка на бэке пока негде держать (см. ConclusionDraftBody).
          formId: null,
          formValues: {},
          formManual: "",
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
  // Какой именно бланк — решают правила «филиал × услуга» из настроек
  // (api/conclusionFormDefaults): заключение привязано к строке услуги, и это
  // единственный ключ, который на живых данных заполнен — специализацию
  // сотруднику PATCH-ем не назначить. Филиал берём из сессии, а не из приёма:
  // врач работает в филиале, куда переключён, и печатает на его форме.
  const defaultsOrgId = useApiOrgId();
  const { activeOrganization, activeBranch } = usePermissions();
  const defaultRules = React.useMemo(
    () => readConclusionFormDefaults(activeOrganization?.themeConfig),
    [activeOrganization],
  );
  // Бланки нужны и для подстановки, и для селекта в секции полей, поэтому
  // грузим их всегда, пока дровер открыт на правку.
  const formsEnabled = open && !readOnly;

  const formsQuery = useQuery({
    queryKey: djangoQueryKeys.conclusionForms.list(defaultsOrgId ?? null),
    queryFn: ({ signal }) => getConclusionForms(defaultsOrgId, signal),
    enabled: formsEnabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });
  // useMemo, а не `?? []`: новый пустой массив на каждом рендере пересчитывал
  // бы мемо ниже и дёргал эффекты секции бланка.
  const availableForms = React.useMemo(() => formsQuery.data ?? [], [formsQuery.data]);

  /** Бланк, положенный правилами именно этому заключению. */
  const defaultForm: ConclusionFormTemplate | null = React.useMemo(() => {
    if (!formsEnabled || conclusion || defaultRules.length === 0) return null;
    if (availableForms.length === 0) return null;
    const id = resolveDefaultFormId(defaultRules, {
      branchId: activeBranch?.id ?? null,
      serviceId: serviceId ?? null,
    });
    // Бланк могли выключить или удалить после того, как правило записали:
    // getConclusionForms без includeInactive неактивные уже не отдаёт.
    return availableForms.find((form) => form.id === id) ?? null;
  }, [formsEnabled, conclusion, defaultRules, availableForms, activeBranch, serviceId]);

  const attachedForm = React.useMemo(
    () => availableForms.find((form) => form.id === formId) ?? null,
    [availableForms, formId],
  );

  /** Значения по умолчанию бланка — то, что уже стоит в его строках как норма. */
  const formDefaults = React.useCallback(
    (form: ConclusionFormTemplate) =>
      Object.fromEntries(form.fields.map((field) => [field.id, field.defaultValue ?? ""])),
    [],
  );

  // Прикрепление дефолтного бланка. Ждём гидратацию: иначе поля легли бы в
  // форму до того, как её перезапишет пустое тело нового заключения.
  const attachedForLineRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!defaultForm || !hydratedRef.current) return;
    if (attachedForLineRef.current === serviceLineId) return;
    attachedForLineRef.current = serviceLineId;
    // Восстановленный черновик уже несёт свой бланк (или сознательно ни один)
    // — не перебиваем его дефолтом.
    if (formId != null || restoredWithFormRef.current) return;

    const defaults = formDefaults(defaultForm);
    setFormId(defaultForm.id);
    setFormValues(defaults);

    // Прикрепление и нормы — не правка врача: без этого автосейв счёл бы их
    // изменением и создавал черновик на каждом просто открытом заключении.
    try {
      const baseline = JSON.parse(baselineRef.current) as ConclusionDraftBody;
      baselineRef.current = JSON.stringify({
        ...baseline,
        formId: defaultForm.id,
        formValues: defaults,
        [targetField(defaultForm.target)]: renderFilledForm(defaultForm, defaults),
      });
    } catch {
      /* baseline ещё не собран — следующая гидратация его перезапишет */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultForm, serviceLineId, hydrationKey]);

  // Закрыли дровер — метку снимаем: следующее открытие снова подставит бланк.
  React.useEffect(() => {
    if (!open) {
      attachedForLineRef.current = null;
      restoredWithFormRef.current = false;
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

  const vitalNode = (kind: VitalKind) => {
    const props = VITAL_PROPS[kind];
    const state = VITAL_STATE[kind];
    return (
      <VitalStepper
        label={props.label}
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

  /** Текстовое поле заключения одним узлом: подпись + поле. */
  const textFieldNode = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    options: { minRows?: number; required?: boolean; hint?: string; locked?: boolean } = {},
  ) => (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        {label} {options.required && !readOnly && "*"}
      </Typography>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly || Boolean(options.locked)}
        multiline
        minRows={options.minRows ?? 2}
        fullWidth
        size="small"
        placeholder={readOnly ? "—" : t("conclusion.optional")}
        helperText={options.hint}
      />
    </Stack>
  );

  /** Степперы, которые бланк не забрал, — остаются в своей карточке. */
  const freeVitals = (Object.keys(VITAL_PROPS) as VitalKind[]).filter((kind) =>
    slotFree(kind),
  );

  /** Штатное поле показываем на своём месте, только если бланк его не забрал. */
  const slotFree = (slot: FormFieldSlot) => !attachedSlots.has(slot);

  const handleSelectForm = (nextId: number) => {
    const next = availableForms.find((form) => form.id === nextId);
    if (!next) return;
    setFormId(next.id);
    setFormValues(formDefaults(next));
    // Хвост не сбрасываем: это вывод врача, а не часть протокола — он
    // остаётся при смене бланка и снова попадёт в конец проекции.
  };

  /**
   * Поле, которое собирает бланк. Врач его не правит: текст — проекция
   * значений полей выше, и правку пришлось бы разбирать обратно в поля, а
   * такой разбор врёт на любой вольности формулировки. Вместо поля ввода на
   * его месте стоит сворачиваемый итог (projectionNode).
   */
  const managedByForm = (field: FormTarget) =>
    attachedForm != null && attachedForm.target === field;

  const handleDetachForm = () => {
    // Текст остаётся: врач дописывает уже собранное заключение руками.
    setFormId(null);
    setFormValues({});
  };

  /**
   * Контролы для привязанных полей бланка. Собираем только те слоты, которые
   * бланк действительно занял: незанятые остаются на своих обычных местах.
   */
  const slotNodes = React.useMemo<Partial<Record<FormFieldSlot, React.ReactNode>>>(() => {
    const nodes: Partial<Record<FormFieldSlot, React.ReactNode>> = {};
    for (const slot of attachedSlots) {
      switch (slot) {
        case "complaints":
          nodes.complaints = textFieldNode(
            t("conclusion.doctorComplaints"),
            complaints,
            setComplaints,
          );
          break;
        case "anamnesis":
          nodes.anamnesis = textFieldNode(t("conclusion.anamnesis"), anamnesis, setAnamnesis, {
            minRows: 3,
          });
          break;
        case "objective":
          nodes.objective = textFieldNode(t("conclusion.objectively"), objective, setObjective, {
            minRows: 3,
          });
          break;
        case "conclusion":
          nodes.conclusion = textFieldNode(
            t("conclusion.conclusionRequired"),
            conclusionText,
            setConclusionText,
            { minRows: 4, required: true },
          );
          break;
        case "heightCm":
        case "weightKg":
        case "temperature":
          nodes[slot] = (
            <Stack direction="row" spacing={1.5}>
              {vitalNode(slot)}
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
    complaints,
    anamnesis,
    objective,
    conclusionText,
    heightCm,
    weightKg,
    temperature,
    readOnly,
  ]);

  // ── печать листа бланка ────────────────────────────────────────────────────
  // Данные шапки (ФИО, ДР, дата приёма, врач) те же, что у штатной печати
  // заключения, поэтому берём их тем же загрузчиком.
  const printDataQuery = useQuery({
    queryKey: ["django", "conclusion-forms", "print-data", appointmentId ?? null, serviceLineId] as const,
    queryFn: () => loadDjangoPrintData(appointmentId as number, serviceLineId),
    enabled: formsEnabled && attachedForm != null && appointmentId != null,
    retry: false,
  });

  /**
   * Значения для печатного листа: свободные поля плюс значения привязанных
   * колонок. В тексте заключения слоты не дублируются, а на листе они —
   * обычные строки протокола, и без них лист вышел бы с пустыми линейками.
   */
  const sheetValues = React.useMemo(() => {
    const slotValue: Record<FormFieldSlot, string> = {
      complaints,
      anamnesis,
      objective,
      conclusion: conclusionText,
      weightKg,
      heightCm,
      temperature,
    };
    const values: Record<string, string> = { ...formValues };
    for (const field of attachedForm?.fields ?? []) {
      if (field.slot) values[field.id] = slotValue[field.slot] ?? "";
    }
    return values;
  }, [
    attachedForm,
    formValues,
    complaints,
    anamnesis,
    objective,
    conclusionText,
    weightKg,
    heightCm,
    temperature,
  ]);

  const handlePrintForm = async () => {
    if (!attachedForm) return;
    setFormPrinting(true);
    setFormPrintError(null);
    try {
      const printData = printDataQuery.data;
      const context: SheetContext = {
        patientFio: printData?.patientFio ?? "—",
        patientDob: printData?.patientDob ?? "—",
        appointmentDateTime: printData?.appt.scheduledAt
          ? dayjs(printData.appt.scheduledAt).format("DD.MM.YYYY HH:mm")
          : "—",
        doctorFio: printData?.doctorFio ?? doctorName,
        clinicName: activeOrganization?.name ?? "",
        clinicLogoUrl: activeOrganization?.logoUrl,
      };
      const blob = await generateFormSheetPdf(attachedForm, context, sheetValues);
      // Открываем во вкладке, а не скачиваем: врачу нужен диалог печати, а не
      // файл в загрузках.
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch {
      setFormPrintError("Не удалось сформировать PDF бланка.");
    } finally {
      setFormPrinting(false);
    }
  };

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
        writeConclusionDraft(serviceLineId, body);
        pendingDraftRef.current = null;
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    open,
    readOnly,
    serviceLineId,
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
    manualText,
  ]);

  // Размонтирование (дровер удаляют из дерева, уход со страницы) — дописываем
  // незаписанный хвост черновика.
  React.useEffect(() => {
    return () => {
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(serviceLineId, pendingDraftRef.current);
        pendingDraftRef.current = null;
      }
    };
  }, [serviceLineId]);

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

  // ── template handlers ─────────────────────────────────────────────────────
  const applyTemplate = (tpl: ConclusionTemplate) => {
    if (tpl.conclusion) setConclusionText(tpl.conclusion);
    if (tpl.anamnesis) setAnamnesis(tpl.anamnesis);
    if (tpl.objective) setObjective(tpl.objective);
    setTplAnchor(null);
    notify?.({ type: "success", message: t("conclusion.templateApplied") });
  };

  const handleSaveTemplate = async () => {
    const name = tplName.trim();
    if (!name) return;
    setTplBusy(true);
    try {
      const created = await createConclusionTemplate({
        name,
        conclusion: conclusionText.trim(),
        anamnesis: anamnesis.trim(),
        objective: objective.trim(),
      });
      setTemplates((prev) => [...prev, created]);
      setSaveTplOpen(false);
      setTplName("");
      notify?.({ type: "success", message: t("conclusion.templateSaved") });
    } catch (err: unknown) {
      notify?.({ type: "error", message: parseBackendError(err) });
    } finally {
      setTplBusy(false);
    }
  };

  /**
   * Вставка заполненного бланка. Дописываем к тому, что уже в поле, а не
   * заменяем: у приёма может быть несколько бланков (осмотр + протокол УЗИ),
   * и второй не должен затирать первый.
   */
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
  const completion = useFormValidation({
    // Пустое заключение при бланке — это незаполненный протокол, а не
    // незаполненное поле: поля как такового врач уже не видит.
    conclusionText: conclusionText.trim()
      ? null
      : managedByForm("conclusion")
      ? "Заполните хотя бы одну строку бланка — заключение не может быть пустым."
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
    try {
      return await upsertConclusion(serviceLineId, payload);
    } catch (err: unknown) {
      if (!isServiceLineGoneError(err) || appointmentId == null) throw err;
      const slots = await getConclusionSlots(appointmentId);
      const fresh = findReplacementSlot(slots, { serviceLineId, serviceId, doctorId });
      // Услуги в приёме больше нет — сохранять некуда, дальше ветка ошибки.
      if (!fresh) throw err;
      const saved = fresh.conclusion?.id
        ? await updateConclusion(fresh.conclusion.id, payload)
        : await upsertConclusion(fresh.serviceLineId, payload);
      clearConclusionDraft(fresh.serviceLineId);
      return saved;
    }
  };

  const handleSave = async (targetStatus: ConclusionStatus) => {
    if (!vitals.validate()) return;
    if (targetStatus === "completed" && !completion.validate()) return;

    setSaveError(null);
    setSaving(true);

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
    };

    try {
      let saved: MedicalConclusion;
      if (conclusion?.id) {
        saved = await updateConclusion(conclusion.id, payload);
      } else {
        saved = await createConclusionForLine(payload);
      }
      // Заключение на сервере — локальный черновик больше не нужен.
      clearConclusionDraft(serviceLineId);
      hydratedRef.current = false;
      pendingDraftRef.current = null;
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
    } catch (err: unknown) {
      // Сырое «Service line not found» ничего не объясняет врачу: строку
      // услуги удалили правкой приёма, а перепривязать заключение не к чему.
      setSaveError(
        isServiceLineGoneError(err)
          ? t("conclusion.errors.serviceLineGone", { service: serviceName })
          : parseBackendError(err),
      );
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

  // ── derived display ───────────────────────────────────────────────────────
  const lastUpdated = conclusion?.updatedAt
    ? dayjs(conclusion.updatedAt).format("DD.MM.YYYY HH:mm")
    : null;

  const content = (
    <>
      {/* ── header ── */}
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        px={2}
        py={1.5}
        sx={{ flexShrink: 0 }}
      >
        <Stack spacing={0.25}>
          <Typography variant="h6" lineHeight={1.3}>
            {readOnly
              ? t("conclusion.title")
              : conclusion
                ? t("conclusion.editTitle")
                : t("conclusion.newTitle")}
          </Typography>
          {/* Услуга/врач и время правки — только в дровере-редакторе, не в
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
        <Stack direction="row" spacing={0.5} alignItems="center">
          {!readOnly && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyOutlined />}
                onClick={(e) => setTplAnchor(e.currentTarget)}
              >
                {t("conclusion.templates")}
              </Button>
              <IconButton
                size="small"
                color="primary"
                title={t("conclusion.saveAsTemplate")}
                onClick={() => {
                  setTplName("");
                  setSaveTplOpen(true);
                }}
              >
                <StarBorderOutlined fontSize="small" />
              </IconButton>
            </>
          )}
          <IconButton onClick={saving ? undefined : onClose} size="small">
            <CloseOutlined />
          </IconButton>
        </Stack>
      </Stack>
      <Divider />

      {/* ── inline-просмотр: тулбар действий под шапкой (единая высота) ── */}
      {inline && readOnly && (onStartEdit || (canPrint && conclusion)) && (
        <>
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            sx={{ px: 2, py: 1, gap: 1, flexShrink: 0 }}
          >
            {onStartEdit && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditOutlined />}
                onClick={onStartEdit}
                sx={{ whiteSpace: "nowrap" }}
              >
                {t("conclusion.editConclusion")}
              </Button>
            )}
            {canPrint && conclusion && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintOutlined />}
                  onClick={() =>
                    window.open(
                      `/print/conclusion/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                      "_blank",
                      "noopener",
                    )
                  }
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {t("conclusion.print")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArticleOutlined />}
                  onClick={() =>
                    window.open(
                      `/print/certificate/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                      "_blank",
                      "noopener",
                    )
                  }
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {t("conclusion.certificate")}
                </Button>
                {receiptAppointmentId != null && receiptAvailable && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ReceiptLongOutlined />}
                    onClick={() => setReceiptFormatOpen(true)}
                    disabled={receiptPending}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("conclusion.receipt")}
                  </Button>
                )}
              </>
            )}
          </Stack>
          <Divider />
        </>
      )}

      {/* ── templates menu ── */}
      <Menu
        anchorEl={tplAnchor}
        open={!!tplAnchor}
        onClose={() => setTplAnchor(null)}
        slotProps={{ paper: { sx: { maxWidth: 360 } } }}
      >
        {templates.length === 0 && (
          <MenuItem disabled>{t("conclusion.noTemplates")}</MenuItem>
        )}
        {templates.map((tpl) => (
          <MenuItem
            key={tpl.id}
            onClick={() => applyTemplate(tpl)}
            sx={{ pr: 1 }}
          >
            <ListItemText
              primary={tpl.name}
              primaryTypographyProps={{ noWrap: true }}
            />
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTemplate(tpl.id);
              }}
            >
              <DeleteOutline fontSize="small" color="error" />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>

      {/* ── body ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          minHeight: 0,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
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
              {/* Витальные — карточки с разделителями */}
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
            </Stack>
          )}

          {/* ════════ ФОРМА РЕДАКТИРОВАНИЯ (только при !readOnly) ════════ */}
          {!readOnly && (
          <>
          {/* ── vitals (степперы как в оригинале) ── */}
          {/* Степпер, который забрал бланк, здесь не рисуем: он стоит в потоке
              его полей (см. slotNodes). Карточку показываем, пока в ней есть
              хоть один степпер или пока есть что сказать об ошибке. */}
          {(freeVitals.length > 0 || Boolean(vitals.errorOf("vitals"))) && (
            <Paper ref={vitals.anchor("vitals")} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1.5}>
                {freeVitals.map((kind) => (
                  <React.Fragment key={kind}>{vitalNode(kind)}</React.Fragment>
                ))}
              </Stack>
              {vitals.errorOf("vitals") && (
                <Alert severity="error" sx={{ py: 0, mt: 1 }}>
                  {vitals.errorOf("vitals")}
                </Alert>
              )}
            </Paper>
          )}

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
          {!readOnly && (
          <Box ref={managedByForm("conclusion") ? completion.anchor("conclusionText") : undefined}>
            <ConclusionFormInline
              forms={availableForms}
              loading={formsQuery.isLoading}
              form={attachedForm}
              values={formValues}
              onSelectForm={handleSelectForm}
              onChangeValue={(fieldId, value) =>
                setFormValues((prev) => ({ ...prev, [fieldId]: value }))
              }
              onDetach={handleDetachForm}
              slotNodes={slotNodes}
              manual={manualText}
              onManualChange={setManualText}
              targetLabel={
                attachedForm ? TARGET_LABELS[attachedForm.target] : TARGET_LABELS.conclusion
              }
              disabled={readOnly}
            />
          </Box>
          )}

          {formPrintError && <Alert severity="error">{formPrintError}</Alert>}

          {/* ── doctor complaints ── */}
          {/* Поле, забранное бланком, здесь не рисуем: оно стоит в потоке его
              полей (slotNodes) — иначе врач вводил бы жалобы дважды. */}
          {slotFree("complaints") &&
            textFieldNode(t("conclusion.doctorComplaints"), complaints, setComplaints)}

          {/* ── anamnesis ── */}
          {slotFree("anamnesis") &&
            (managedByForm("anamnesis")
              ? projectionNode(t("conclusion.anamnesis"), anamnesis, null)
              : textFieldNode(t("conclusion.anamnesis"), anamnesis, setAnamnesis, {
                  minRows: 3,
                }))}

          {/* ── objective ── */}
          {slotFree("objective") &&
            (managedByForm("objective")
              ? projectionNode(t("conclusion.objectively"), objective, null)
              : textFieldNode(t("conclusion.objectively"), objective, setObjective, {
                  minRows: 3,
                }))}

          {/* ── diagnosis (catalog multi-select + free text) ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {t("conclusion.diagnosisIcd")}
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              disableCloseOnSelect
              options={catalog}
              value={selectedDiagnoses}
              loading={catalogLoading}
              disabled={readOnly}
              // Поиск идёт на сервере (см. эффект загрузки каталога), поэтому
              // клиентскую фильтрацию отключаем — иначе список схлопнулся бы до
              // уже загруженной страницы.
              filterOptions={(opts) => opts}
              onInputChange={(_, val, reason) => {
                if (reason === "input") setDiagInput(val);
              }}
              noOptionsText={
                diagInput.trim()
                  ? t("conclusion.nothingFound")
                  : t("conclusion.startTypingCode")
              }
              getOptionLabel={(o) =>
                typeof o === "string" ? o : [o.code, o.title].filter(Boolean).join(" — ")
              }
              isOptionEqualToValue={(o, v) =>
                o.id === v.id || (o.code === v.code && o.code !== "")
              }
              onChange={(_, value) =>
                setSelectedDiagnoses(
                  value.map((item) =>
                    typeof item === "string"
                      ? { id: -1, code: "", title: item.trim(), displayName: "", isActive: true, sortOrder: 0 }
                      : item,
                  ).filter((item) => item.title !== ""),
                )
              }
              filterSelectedOptions
              size="small"
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    readOnly
                      ? "—"
                      : t("conclusion.diagnosisPlaceholder")
                  }
                />
              )}
            />
            {catalogError && (
              <Alert severity="warning" sx={{ py: 0 }}>
                {t("conclusion.catalogLoadFailed")}
              </Alert>
            )}
            {/* сводка выбранных диагнозов (как в оригинале) */}
            <Paper
              variant="outlined"
              sx={{ p: 1.5, mt: 0.5, minHeight: 44, bgcolor: "background.default" }}
            >
              <Typography
                variant="body2"
                color={selectedDiagnoses.length ? "text.primary" : "text.disabled"}
              >
                {selectedDiagnoses.length
                  ? selectedDiagnoses
                      .map((d) => [d.code, d.title].filter(Boolean).join(" "))
                      .join(". ")
                  : t("conclusion.noDiagnosis", {
                      selected: agree(term.diagnosis.gender, ["выбран", "выбрана", "выбрано"]),
                    })}
              </Typography>
            </Paper>
          </Stack>

          {/* ── conclusion (main) ── */}
          {/* Забрать заключение в поток бланка можно (slot "conclusion"), но
              обязательным оно остаётся: скрываем только когда бланк его правда
              рисует, иначе врачу негде выполнить требование «*». */}
          {slotFree("conclusion") &&
            // Бланк собирает это поле сам — вместо заблокированной копии текста
            // показываем сворачиваемый итог. Якорь валидации при этом уезжает
            // на секцию бланка (см. ниже, ref у ConclusionFormInline): иначе
            // «Завершить» с пустым протоколом ругался бы в никуда.
            (managedByForm("conclusion") ? (
              projectionNode(
                t("conclusion.conclusionRequired"),
                conclusionText,
                completion.errorOf("conclusionText"),
              )
            ) : (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  {t("conclusion.conclusionRequired")} {!readOnly && "*"}
                </Typography>
                <TextField
                  value={conclusionText}
                  onChange={(e) => setConclusionText(e.target.value)}
                  disabled={readOnly}
                  multiline
                  minRows={4}
                  fullWidth
                  size="small"
                  placeholder={readOnly ? "—" : t("conclusion.text")}
                  {...completion.field("conclusionText", "")}
                />
              </Stack>
            ))}

          {/* ── internal comment ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {t("conclusion.internalComment")}
            </Typography>
            <TextField
              value={internalComment}
              onChange={(e) => setInternalComment(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : t("conclusion.notVisibleToPatient")}
            />
          </Stack>

          {/* ── photos ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {t("conclusion.photos2")}
            </Typography>
            <Grid container spacing={1}>
              {photoUrls.map((url) => (
                <Grid item key={url}>
                  <Box
                    sx={{
                      position: "relative",
                      width: 72,
                      height: 72,
                      borderRadius: 1,
                      overflow: "hidden",
                      border: "1px solid",
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
                    {!readOnly && (
                      <IconButton
                        size="small"
                        onClick={() => removePhoto(url)}
                        sx={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bgcolor: "rgba(255,255,255,0.8)",
                          p: 0.25,
                          "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                        }}
                      >
                        <DeleteOutline sx={{ fontSize: 14 }} color="error" />
                      </IconButton>
                    )}
                  </Box>
                </Grid>
              ))}
              {!readOnly && (
                <Grid item>
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
                </Grid>
              )}
            </Grid>
          </Stack>
          </>
          )}

          {/* ── status select (only when editing) ── */}
          {!readOnly && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {t("conclusion.status")}
              </Typography>
              <TextField
                select
                value={status}
                onChange={(e) => setStatus(e.target.value as ConclusionStatus)}
                size="small"
                fullWidth
              >
                <MenuItem value="draft">{t("conclusion.statusDraft")}</MenuItem>
                <MenuItem value="completed">{t("conclusion.statusCompleted")}</MenuItem>
              </TextField>
            </Stack>
          )}

          {/* ── print (в inline-режиме кнопки уже в шапке) ── */}
          {!inline && canPrint && conclusion && (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  window.open(
                    `/print/conclusion/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                {t("conclusion.printConclusion")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  window.open(
                    `/print/certificate/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                {t("conclusion.certificate")}
              </Button>
              {receiptAppointmentId != null && receiptAvailable && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ReceiptLongOutlined />}
                  onClick={() => setReceiptFormatOpen(true)}
                  disabled={receiptPending}
                >
                  {t("conclusion.receipt")}
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </Box>

      {/* ── footer ── (в inline-просмотре скрыт: закрытие — крестиком в шапке) */}
      {!(inline && readOnly) && (
      <>
      <Divider />
      <Box sx={{ p: 2, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={saving ? undefined : onClose} disabled={saving}>
            {readOnly ? t("conclusion.close") : t("conclusion.cancel")}
          </Button>
          {!readOnly && (
            <>
              {/* Печать одна: прикреплён бланк — печатаем его лист (шапка
                  клиники, подложка, значения полей), иначе документ печатается
                  штатной формой заключения из кнопок выше. */}
              {attachedForm && canPrint && (
                <Button
                  variant="outlined"
                  startIcon={<PrintOutlined />}
                  disabled={formPrinting}
                  onClick={handlePrintForm}
                >
                  {t("conclusion.print")}
                </Button>
              )}
              <Button
                variant="outlined"
                disabled={saving}
                onClick={() => handleSave("draft")}
                startIcon={
                  saving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : undefined
                }
              >
                {t("conclusion.saveDraft")}
              </Button>
              <Button
                variant="contained"
                color="success"
                disabled={saving}
                onClick={() => handleSave("completed")}
                startIcon={
                  saving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SaveOutlined />
                  )
                }
              >
                {t("conclusion.complete")}
              </Button>
            </>
          )}
        </Stack>
      </Box>
      </>
      )}

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

      <InvoiceFormatDialog
        open={receiptFormatOpen}
        onCancel={() => setReceiptFormatOpen(false)}
        onConfirm={handlePrintReceipt}
      />
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
        sx: {
          width: { xs: "100vw", sm: 520, md: 560 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {content}
    </Drawer>
  );
};

export default DjangoConclusionDrawer;
