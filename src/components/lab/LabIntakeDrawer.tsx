import React from "react";
import {
  Alert,
  Box,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { AppButton } from "../ui";
import PatientSection from "./intake/PatientSection";
import ReferralSection from "./intake/ReferralSection";
import CommentSection from "./intake/CommentSection";
import BasketSection from "./intake/BasketSection";
import QuestionsSection from "./intake/QuestionsSection";
import InstrumentsSection from "./intake/InstrumentsSection";
import PreparationSection from "./intake/PreparationSection";
import PaymentSection from "./intake/PaymentSection";
import type { BasketLine } from "./intake/basketCatalog";
import { assembleLabAnswers } from "./intake/labQuestionFields";

import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useCashlessMethods } from "../../hooks/useCashlessMethods";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";

import {
  createLabOrder,
  dispatchLabOrder,
  getLabInstruments,
  getLabPreparation,
  getLabQuestions,
  getLabSettings,
  getLabTests,
  testIdsQuery,
  type LabQuestion,
  type LabReceipt,
  type LabSettings,
  type LabTest,
} from "../../api/lab";
import { getPatient, searchPatients, updatePatient, type DjangoPatient } from "../../api/patients";
import { getBranches } from "../../api/organization";
import { orgWide } from "../../api/scope";
import { ApiError, getErrorMessage } from "../../api/client";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";

import { clearFormDraft, readFormDraft, writeFormDraft } from "../../utility/formDraft";
import { basketTotals } from "../../utility/labTotals";
import { intakeBlockReason, type IntakeState } from "../../utility/labIntakeGuards";
import { printHtml } from "../../utility/labLabels";
import {
  buildLabIntakeBody,
  buildPatientPatch,
  effectivePatientInfo,
  type PatientEdits,
} from "../../utility/labIntakeSubmit";
import { describeLabIntakeOrderError } from "../../utility/labIntakeErrors";
import { buildLabIntakePrintouts } from "../../utility/labIntakePrint";
import { formatKGS } from "../../utility/format";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // черновик старше суток считаем неактуальным

type PaymentState = {
  cash: string;
  card: string;
  cashlessMethodId: number | null;
  discountPercent: number;
};

const BLANK_EDITS: PatientEdits = { inn: "", birthDate: null, gender: "" };
const DEFAULT_PAYMENT: PaymentState = { cash: "0", card: "0", cashlessMethodId: null, discountPercent: 0 };

type Phase = "editing" | "submitting" | "done" | "failed";

interface LabIntakeDraftValues {
  lines: BasketLine[];
  payment: PaymentState;
}

function draftKey(patientId: number): string {
  return `lab-intake:${patientId}`;
}

function loadDraft(patientId: number): LabIntakeDraftValues | null {
  return readFormDraft<LabIntakeDraftValues & { savedAt: number }>(draftKey(patientId), DRAFT_TTL_MS);
}

/** Строка ввода → число, терпимо к запятой. Та же логика, что в PaymentSection. */
function toAmount(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isPaymentEmpty(payment: PaymentState): boolean {
  return (
    toAmount(payment.cash) === 0 &&
    toAmount(payment.card) === 0 &&
    payment.cashlessMethodId === null &&
    payment.discountPercent === 0
  );
}

export interface LabIntakeDrawerProps {
  open: boolean;
  onClose: () => void;
  /** `?patientId=` из адреса ленты — дровер открывается сразу на этом пациенте. */
  initialPatientId: number | null;
}

/**
 * Дровер приёма анализов — оркестратор.
 *
 * Держит всё состояние и оба сетевых обращения приёма (дозаполнение карты,
 * затем сам приём), склеивает шесть секций-компонентов. Секции — чистые
 * обёртки на пропсах и колбэках, сеть и решения — только здесь (см.
 * lab-frontend-design.md, «Почему дровер разбит на секции»).
 *
 * Логика, которую можно проверить без рендера (сборка тела запроса, разбор
 * 422/502, что печатать после успеха), вынесена в `utility/labIntake*.ts` и
 * покрыта тестами там — здесь остаётся только оркестрация: state, эффекты,
 * вызовы API, JSX.
 */
const LabIntakeDrawer: React.FC<LabIntakeDrawerProps> = ({ open, onClose, initialPatientId }) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { activeBranch } = usePermissions();
  const orgId = useApiOrgId();

  // ── Состояние — шесть полей плюс то, что неизбежно ложится поверх приёма
  // (см. отчёт по Task 10: филиал и фазы 502/готово план не описывает совсем,
  // но без них дровер не работает).
  const [patient, setPatient] = React.useState<DjangoPatient | null>(null);
  const [patientEdits, setPatientEdits] = React.useState<PatientEdits>(BLANK_EDITS);
  const [lines, setLines] = React.useState<BasketLine[]>([]);
  const [referringDoctorId, setReferringDoctorId] = React.useState<number | null>(null);
  const [comment, setComment] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const [payment, setPayment] = React.useState<PaymentState>(DEFAULT_PAYMENT);
  const [phase, setPhase] = React.useState<Phase>("editing");

  const [receipt, setReceipt] = React.useState<LabReceipt | null>(null);
  const [failedOrderId, setFailedOrderId] = React.useState<number | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  const [printError, setPrintError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  const [patientQuery, setPatientQuery] = React.useState("");
  const [patientResults, setPatientResults] = React.useState<DjangoPatient[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = React.useState(false);

  const [branchChoice, setBranchChoice] = React.useState<number | "">("");

  // ── Филиал: обычно приходит из шапки; когда сессия в режиме «Все филиалы»,
  // выбирается прямо в форме — как в DjangoSaleFormDrawer (showBranchSelect).
  // Обязателен: бэкенд отвечает 422 без него (branchId определяет точку
  // регистрации в ЛИС).
  const branchId: number | null = activeBranch?.id ?? (branchChoice === "" ? null : branchChoice);

  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, orgId ?? null],
    queryFn: () => getBranches(orgId),
    enabled: open && activeBranch == null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const orgBranches = branchesQuery.data ?? [];

  // ── Сброс/восстановление при открытии ────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setPhase("editing");
    setReceipt(null);
    setFailedOrderId(null);
    setSubmitError(null);
    setRetryError(null);
    setPrintError(null);
    setAnswers({});
    setPatientQuery("");
    setPatientResults([]);
    setBranchChoice("");

    if (initialPatientId != null) {
      getPatient(initialPatientId)
        .then((p) => {
          if (cancelled) return;
          setPatient(p);
          setPatientEdits(BLANK_EDITS);
          const draft = loadDraft(p.id);
          setLines(draft?.lines ?? []);
          setPayment(draft?.payment ?? DEFAULT_PAYMENT);
          setDraftRestored(!!draft);
        })
        .catch(() => {
          // Ссылка из истории пациента устарела (пациент удалён и т.п.) —
          // открываем дровер пустым, а не роняем его целиком.
          if (cancelled) return;
          setPatient(null);
          setPatientEdits(BLANK_EDITS);
          setLines([]);
          setReferringDoctorId(null);
          setComment("");
          setPayment(DEFAULT_PAYMENT);
          setDraftRestored(false);
        });
    } else {
      setPatient(null);
      setPatientEdits(BLANK_EDITS);
      setLines([]);
      setReferringDoctorId(null);
      setComment("");
      setPayment(DEFAULT_PAYMENT);
      setDraftRestored(false);
    }

    return () => {
      cancelled = true;
    };
  }, [open, initialPatientId]);

  // ── Выбор пациента вручную (автокомплит) ─────────────────────────────────
  const handleSelectPatient = (p: DjangoPatient | null) => {
    setPatient(p);
    setPatientEdits(BLANK_EDITS);
    setAnswers({});
    // Ошибка предыдущей попытки (422 от прошлого пациента) не должна висеть
    // над формой для нового — иначе текст указывает не на то, что мешает.
    setSubmitError(null);
    if (p) {
      const draft = loadDraft(p.id);
      setLines(draft?.lines ?? []);
      setPayment(draft?.payment ?? DEFAULT_PAYMENT);
      setDraftRestored(!!draft);
    } else {
      setLines([]);
      setPayment(DEFAULT_PAYMENT);
      setDraftRestored(false);
    }
  };

  // ── Поиск пациента с debounce (тот же паттерн, что в DjangoAddAppointmentDrawer) ──
  React.useEffect(() => {
    if (!open) return;
    const q = patientQuery.trim();
    if (q.length < 2) {
      setPatientResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setPatientSearchLoading(true);
      // Филиалом не сужаем — пациента соседнего филиала тоже нужно найти.
      searchPatients(orgWide(orgId), q, 20, ctrl.signal)
        .then((rows) => {
          if (!ctrl.signal.aborted) setPatientResults(rows);
        })
        .catch(() => {
          /* abort/сеть — оставляем прошлый результат */
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setPatientSearchLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, patientQuery, orgId]);

  // ── Черновик: пишется с debounce при изменениях, ключ по пациенту ────────
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    if (!patient || phase !== "editing") return;
    const key = draftKey(patient.id);
    if (isPaymentEmpty(payment) && lines.length === 0) {
      clearFormDraft(key);
    } else {
      writeFormDraft(key, { lines, payment });
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, patient, lines, payment, phase]);

  const handleDiscardDraft = () => {
    if (patient) clearFormDraft(draftKey(patient.id));
    setLines([]);
    setPayment(DEFAULT_PAYMENT);
    setDraftRestored(false);
  };

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  // ── Каталог: грузится один раз при открытии ──────────────────────────────
  const testsQuery = useQuery<LabTest[]>({
    queryKey: djangoQueryKeys.lab.tests,
    queryFn: ({ signal }) => getLabTests(signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  // useMemo, а не голое `?? []`: иначе на каждом рендере до первых данных
  // рождался бы новый пустой массив, и useMemo ниже (totals), зависящий от
  // tests, пересчитывался бы вхолостую (тот же приём, что в
  // src/pages/lab/django/index.tsx для orders).
  const tests = React.useMemo(() => testsQuery.data ?? [], [testsQuery.data]);

  // ── Настройки раздела: платит ли клиника за пробирки и заведена ли у неё
  // конфигурация раздела вообще (`OrganizationLabConfig`) — грузятся тем же
  // способом и в тот же момент, что и каталог. Раньше плата была хардкодом
  // `CHARGE_TUBES = false` (см. отчёт по Task 10), и у клиник с включённой
  // платой приём не проходил вовсе: сумма на экране не совпадала с суммой
  // бэкенда (422 «Оплата не совпадает с суммой заказа»). Эндпоинт настроек
  // добавлен на бэкенде в 9138b2c.
  const settingsQuery = useQuery<LabSettings>({
    queryKey: djangoQueryKeys.lab.settings,
    queryFn: ({ signal }) => getLabSettings(signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  // Пока запрос не завершился успехом, доверять chargeInstruments нельзя:
  // `false` по умолчанию совпадает с бэкендом только у части клиник, и
  // именно эта подмена ломала приём у остальных. Кнопку блокируем на время
  // загрузки и при ошибке (intakeBlockReason), вместо того чтобы на миг
  // показать возможно неверную сумму.
  const settingsLoading = settingsQuery.isLoading;
  const settingsFailed = settingsQuery.isError;
  const sectionConfigured = settingsQuery.data?.configured ?? false;
  const chargeTubes = settingsQuery.data?.chargeInstruments ?? false;

  // ── Пробирки/вопросы/подготовка: перезагружаются при изменении корзины,
  // с debounce — без него каждый чекбокс давал бы три запроса.
  const idsKey = React.useMemo(
    () => testIdsQuery(lines.map((l) => l.testId)),
    [lines],
  );
  const debouncedIdsKey = useDebouncedValue(idsKey);
  const debouncedIds = React.useMemo(
    () => (debouncedIdsKey ? debouncedIdsKey.split(",").map(Number) : []),
    [debouncedIdsKey],
  );

  const instrumentsQuery = useQuery({
    queryKey: djangoQueryKeys.lab.instruments(debouncedIdsKey),
    queryFn: ({ signal }) => getLabInstruments(debouncedIds, signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const questionsQuery = useQuery<LabQuestion[]>({
    queryKey: djangoQueryKeys.lab.questions(debouncedIdsKey),
    queryFn: ({ signal }) => getLabQuestions(debouncedIds, signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const preparationQuery = useQuery({
    queryKey: djangoQueryKeys.lab.preparation(debouncedIdsKey),
    queryFn: ({ signal }) => getLabPreparation(debouncedIds, signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const instruments = React.useMemo(() => instrumentsQuery.data ?? [], [instrumentsQuery.data]);
  const questions = React.useMemo(() => questionsQuery.data ?? [], [questionsQuery.data]);
  const preparationTexts = React.useMemo(() => preparationQuery.data ?? [], [preparationQuery.data]);

  // ── Способ безнала — скоуп операции (её филиал), не активной сессии ──────
  const {
    methods: cashlessMethods,
    isLoading: cashlessMethodsLoading,
    isError: cashlessMethodsFailed,
    isRequired: cashlessMethodRequired,
  } = useCashlessMethods(open, { organizationId: orgId, branchId: branchId ?? undefined });

  // ── Производные значения — не дублируются в состояние (design: «Состояние
  // и поток») ───────────────────────────────────────────────────────────────
  const effective = React.useMemo(() => effectivePatientInfo(patient, patientEdits), [patient, patientEdits]);

  const totals = React.useMemo(
    () =>
      basketTotals({
        lines: lines.map((line) => {
          const test = tests.find((t) => t.id === line.testId);
          return {
            testId: line.testId,
            priceStandard: test?.priceStandard ?? "0",
            priceExpress: test?.priceExpress ?? "0",
            count: line.count,
            express: line.express,
          };
        }),
        tubes: instruments.map((i) => ({ instrumentId: i.id, price: i.price, count: i.count })),
        discountPercent: payment.discountPercent,
        chargeTubes,
      }),
    [lines, tests, instruments, payment.discountPercent, chargeTubes],
  );

  // Направивший врач выбирается из активных сотрудников организации — тем
  // же справочником, что и исполнитель услуги в форме приёма.
  const { employees: doctors, isLoading: doctorsLoading } =
    useAllActiveEmployees(open);

  const requiredQuestionIds = React.useMemo(() => questions.map((q) => q.id), [questions]);

  // Анализы корзины, которые лаборатория делает только по направлению
  // (`requiresDoctor`, признак `@required_doctor` каталога ЛИС). Имена, а
  // не счётчик: если направления нет, регистратору надо знать, какую
  // строку убрать.
  const referralRequiredFor = React.useMemo(() => {
    const byId = new Map(tests.map((test) => [test.id, test]));
    return lines
      .map((line) => byId.get(line.testId))
      .filter((test) => test?.requiresDoctor)
      .map((test) => test!.title);
  }, [lines, tests]);

  const guardState: IntakeState = {
    patientId: patient?.id ?? null,
    patientInn: effective.inn,
    patientBirthDate: effective.birthDate,
    patientGender: effective.gender,
    lineCount: lines.length,
    requiredQuestionIds,
    answers,
    total: totals.total,
    paidCash: toAmount(payment.cash),
    paidCard: toAmount(payment.card),
    cashlessMethodId: payment.cashlessMethodId,
    cashlessMethodRequired,
    settingsLoading,
    settingsFailed,
    sectionConfigured,
    referralRequiredFor,
    referringDoctorId,
  };
  const branchReason = branchId == null ? "Выберите филиал" : null;
  const blockReason = branchReason ?? intakeBlockReason(guardState);

  const printouts = React.useMemo(() => {
    if (!receipt) return null;
    return buildLabIntakePrintouts({
      receipt,
      patientName: patient?.fullName ?? "",
      patientBirthDate: effective.birthDate,
      preparationTexts,
    });
  }, [receipt, patient, effective.birthDate, preparationTexts]);

  const handlePrint = (html: string) => {
    setPrintError(printHtml(html) ? null : "Браузер заблокировал окно печати — разрешите всплывающие окна для этой страницы и повторите");
  };

  // ── 403 «не должно случаться» (lab-frontend-design.md, «Отказы»): раздел
  // и так скрыт при отсутствии права/модуля, поэтому попадание сюда — не
  // штатный путь. Показываем сообщение и закрываем дровер, а не оставляем
  // его открытым в заведомо недоступном состоянии.
  const handleForbidden = (err: unknown): boolean => {
    if (err instanceof ApiError && err.status === 403) {
      enqueueSnackbar(getErrorMessage(err, "Недостаточно прав для приёма анализов"), { variant: "error" });
      handleClose();
      return true;
    }
    return false;
  };

  // ── Приём: сначала дозаполнение карты (если менялось), затем сам приём ───
  const handleAccept = async () => {
    if (!patient || branchId == null || blockReason) return;
    setPhase("submitting");
    setSubmitError(null);

    const patch = buildPatientPatch(patient, patientEdits);
    if (patch) {
      try {
        await updatePatient(patient.id, patch);
        // Дозаполненные поля теперь в карте — переносим их в локальное
        // состояние, чтобы при повторной попытке (после неудачи приёма) не
        // отправлять тот же PATCH ещё раз и не показывать поля дозаполнения
        // снова как пустые.
        setPatient((prev) => (prev ? { ...prev, ...patch } : prev));
        setPatientEdits(BLANK_EDITS);
      } catch (err) {
        if (handleForbidden(err)) return;
        setPhase("editing");
        setSubmitError(getErrorMessage(err, "Не удалось сохранить данные пациента"));
        return;
      }
    }

    const body = buildLabIntakeBody({
      patientId: patient.id,
      branchId,
      lines,
      answers: assembleLabAnswers(questions, answers),
      paidCash: payment.cash,
      paidCard: payment.card,
      cashlessMethodId: payment.cashlessMethodId,
      discountPercent: payment.discountPercent,
      referringDoctorId,
      comment,
    });

    try {
      const created = await createLabOrder(body);
      setReceipt(created);
      setPhase("done");
      clearFormDraft(draftKey(patient.id));
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.lab.all });
    } catch (err) {
      if (handleForbidden(err)) return;
      const outcome = describeLabIntakeOrderError(err);
      if (outcome.kind === "lisUnavailable") {
        setFailedOrderId(outcome.orderId);
        setSubmitError(outcome.message);
        setPhase("failed");
      } else {
        setSubmitError(outcome.message);
        setPhase("editing");
      }
    }
  };

  // ── Повторная отправка после 502 — ровно одна кнопка, корзина не трогается ──
  const handleRetryDispatch = async () => {
    if (failedOrderId == null) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const created = await dispatchLabOrder(failedOrderId);
      setReceipt(created);
      setPhase("done");
      setFailedOrderId(null);
      if (patient) clearFormDraft(draftKey(patient.id));
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.lab.all });
    } catch (err) {
      if (handleForbidden(err)) return;
      // Отправка либо ещё раз упирается в недоступную ЛИС, либо повтор сам
      // по себе отказал (см. labIntakeErrors.ts) — заказ в любом случае уже
      // существует и оплачен, поэтому фаза остаётся 'failed', меняется
      // только текст.
      setRetryError(getErrorMessage(err, "Не удалось повторить отправку"));
    } finally {
      setRetrying(false);
    }
  };

  const editing = phase === "editing";
  const busy = phase === "submitting" || retrying;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 560, md: 720, lg: 820 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      {/* Шапка */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5, flexShrink: 0 }}>
        <Typography variant="h6" fontWeight={600}>
          Приём анализов
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {draftRestored && editing && (
            <Tooltip title="Восстановлен черновик — очистить?">
              <IconButton onClick={handleDiscardDraft} aria-label="Очистить черновик">
                <RestoreOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={busy ? undefined : handleClose} aria-label="Закрыть" edge="end" disabled={busy}>
            <CloseOutlined />
          </IconButton>
        </Stack>
      </Stack>
      <Divider />

      {/* Содержимое */}
      <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
        <Stack spacing={2.5}>
          {/* Раздел не настроен у организации — регистратор должен узнать
              об этом до того, как соберёт корзину и введёт оплату, а не из
              загадочного отказа на кнопке приёма (см. отчёт по задаче
              «дровер + настройки раздела»). Показываем плашкой сразу при
              открытии, а не только текстом блокировки в подвале. */}
          {editing && !settingsLoading && !settingsFailed && !sectionConfigured && (
            <Alert severity="error">
              Раздел лаборатории не настроен для вашей организации — приём анализов
              недоступен. Обратитесь к администратору.
            </Alert>
          )}

          {phase === "done" && receipt && receipt.order.status !== "dispatched" && (
            <Alert severity="info">
              <Stack spacing={1}>
                <Typography fontWeight={600}>
                  Заказ №{receipt.order.id} принят и оплачен на{" "}
                  {formatKGS(receipt.order.totalAmount)}
                </Typography>
                <Typography variant="body2">
                  Отправка в лабораторию отложена настройкой — заказ ждёт
                  отправки. Этикетки и регистрационный лист рисует сама ЛИС по
                  номеру заказа, поэтому появятся после отправки.
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <AppButton
                    size="small"
                    variant="outlined"
                    onClick={() => printouts && handlePrint(printouts.preparation)}
                  >
                    Памятка подготовки
                  </AppButton>
                </Stack>
                {printError && <Alert severity="warning">{printError}</Alert>}
              </Stack>
            </Alert>
          )}

          {phase === "done" && receipt && receipt.order.status === "dispatched" && (
            <Alert severity="success">
              <Stack spacing={1}>
                <Typography fontWeight={600}>
                  Заказ №{receipt.order.lisOrderCode ?? receipt.order.id} принят и оплачен на{" "}
                  {formatKGS(receipt.order.totalAmount)}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <AppButton size="small" variant="outlined" onClick={() => printouts && handlePrint(printouts.labels)}>
                    Этикетки
                  </AppButton>
                  <Tooltip
                    title={
                      printouts && printouts.ticket === null
                        ? "ЛИС присылает регистрационный лист не картинкой — распечатать его пока нельзя"
                        : ""
                    }
                  >
                    <span>
                      <AppButton
                        size="small"
                        variant="outlined"
                        disabled={!printouts || printouts.ticket === null}
                        onClick={() => printouts?.ticket && handlePrint(printouts.ticket)}
                      >
                        Регистрационный лист
                      </AppButton>
                    </span>
                  </Tooltip>
                  <AppButton
                    size="small"
                    variant="outlined"
                    onClick={() => printouts && handlePrint(printouts.preparation)}
                  >
                    Памятка подготовки
                  </AppButton>
                </Stack>
                {printError && <Alert severity="warning">{printError}</Alert>}
              </Stack>
            </Alert>
          )}

          {phase === "failed" && (
            <Alert severity="warning">
              <Stack spacing={0.5}>
                <Typography fontWeight={600}>Оплачено, не отправлено</Typography>
                <Typography variant="body2">
                  Заказ №{failedOrderId} создан и оплачен, но не ушёл в лабораторию.
                  {submitError ? ` ${submitError}` : ""}
                </Typography>
                {retryError && (
                  <Typography variant="body2" color="error.main">
                    Повтор не удался: {retryError}
                  </Typography>
                )}
              </Stack>
            </Alert>
          )}

          {editing && submitError && <Alert severity="error">{submitError}</Alert>}

          {activeBranch == null && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Филиал
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={branchChoice}
                onChange={(e) => setBranchChoice(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={!editing}
              >
                <MenuItem value="">Выберите филиал</MenuItem>
                {orgBranches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}

          <PatientSection
            patient={patient}
            inn={patientEdits.inn}
            birthDate={patientEdits.birthDate}
            gender={patientEdits.gender}
            disabled={!editing}
            onSelect={handleSelectPatient}
            onInnChange={(value) => setPatientEdits((prev) => ({ ...prev, inn: value }))}
            onBirthDateChange={(value) => setPatientEdits((prev) => ({ ...prev, birthDate: value }))}
            onGenderChange={(value) => setPatientEdits((prev) => ({ ...prev, gender: value }))}
            searchQuery={patientQuery}
            searchResults={patientResults}
            searchLoading={patientSearchLoading}
            onSearchChange={setPatientQuery}
          />

          <ReferralSection
            doctors={doctors}
            value={referringDoctorId}
            loading={doctorsLoading}
            disabled={!editing}
            requiredFor={referralRequiredFor}
            onChange={setReferringDoctorId}
          />

          <BasketSection
            tests={tests}
            selected={lines}
            patientGender={effective.gender}
            loading={testsQuery.isLoading}
            disabled={!editing}
            onAdd={(testId) => setLines((prev) => [...prev, { testId, count: 1, express: false }])}
            onRemove={(testId) => setLines((prev) => prev.filter((l) => l.testId !== testId))}
            onCountChange={(testId, count) =>
              setLines((prev) => prev.map((l) => (l.testId === testId ? { ...l, count } : l)))
            }
            onExpressChange={(testId, express) =>
              setLines((prev) => prev.map((l) => (l.testId === testId ? { ...l, express } : l)))
            }
          />

          <QuestionsSection
            questions={questions}
            answers={answers}
            loading={questionsQuery.isLoading}
            disabled={!editing}
            onAnswerChange={(questionId, value) => setAnswers((prev) => ({ ...prev, [questionId]: value }))}
          />

          <InstrumentsSection instruments={instruments} loading={instrumentsQuery.isLoading} chargeTubes={chargeTubes} />

          <PreparationSection texts={preparationTexts} loading={preparationQuery.isLoading} />

          <CommentSection
            value={comment}
            disabled={!editing}
            onChange={setComment}
          />

          <PaymentSection
            total={totals.total}
            testsGross={totals.testsGross}
            paidCash={payment.cash}
            paidCard={payment.card}
            cashlessMethodId={payment.cashlessMethodId}
            discountPercent={payment.discountPercent}
            disabled={!editing}
            onCashChange={(value) => setPayment((prev) => ({ ...prev, cash: value }))}
            onCardChange={(value) => setPayment((prev) => ({ ...prev, card: value }))}
            onCashlessMethodChange={(id) => setPayment((prev) => ({ ...prev, cashlessMethodId: id }))}
            onDiscountChange={(percent) => setPayment((prev) => ({ ...prev, discountPercent: percent }))}
            cashlessMethods={cashlessMethods}
            cashlessMethodsLoading={cashlessMethodsLoading}
            cashlessMethodsFailed={cashlessMethodsFailed}
          />
        </Stack>
      </Box>
      <Divider />

      {/* Подвал */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5, flexShrink: 0 }} gap={2}>
        <Typography variant="caption" color="error.main" sx={{ minWidth: 0 }}>
          {editing ? blockReason : ""}
        </Typography>
        <Stack direction="row" gap={1} flexShrink={0}>
          <AppButton variant="text" onClick={handleClose} disabled={busy}>
            {editing || phase === "submitting" ? "Отмена" : "Закрыть"}
          </AppButton>
          {phase === "failed" ? (
            <AppButton variant="contained" onClick={handleRetryDispatch} loading={retrying}>
              Повторить отправку
            </AppButton>
          ) : phase !== "done" ? (
            <AppButton variant="contained" onClick={handleAccept} disabled={!!blockReason} loading={phase === "submitting"}>
              Принять анализы
            </AppButton>
          ) : null}
        </Stack>
      </Stack>
    </Drawer>
  );
};

export default LabIntakeDrawer;
