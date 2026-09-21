import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Slide,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import KeyboardDoubleArrowRightOutlined from "@mui/icons-material/KeyboardDoubleArrowRightOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, ConfirmDialog, CustomDateTimePicker, SegmentedTabs } from "../ui";
import ChannelIcon from "./ChannelIcon";
import DealChatPane from "./DealChatPane";
import LostReasonDialog from "./LostReasonDialog";
import StageTimeline from "./StageTimeline";
import { buildStageSegments } from "./stageSegments";
import CreateTaskDrawer from "../tasks/CreateTaskDrawer";
import DjangoAddAppointmentDrawer from "../../pages/appointments/DjangoAddAppointmentDrawer";
import { useT } from "../../i18n/VerticalProvider";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useCanChecker } from "../../hooks/useCan";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { getServices, type Service } from "../../api/catalog";
import { orgWide } from "../../api/scope";
import {
  addDealActivity,
  addDealItem,
  deleteDeal,
  deleteDealItem,
  getDeal,
  updateDeal,
  updateDealItem,
  moveDealTo,
  type DealActivityType,
  type DealDictionaryItem,
  type DealStage,
  type UpdateDealPayload,
} from "../../api/deals";
import {
  DEAL_ACTIVITY_META,
  dealsErrorMessage,
  exactMoment,
  stageAgeLabel,
  stageDurationLabel,
} from "../../pages/deals/meta";

/** Ширина дровера без чата — как у остальных карточек CRM. */
const DRAWER_WIDTH = 520;
/** Колонка сделки, когда рядом открыт чат: чуть шире обычного, чтобы поля не сжимались. */
const DEAL_COLUMN_WIDTH = 560;
/** Дровер с чатом: сделка + ~460px на разговор Chatwoot. */
const DRAWER_WIDTH_WITH_CHAT = 1020;
/** Длительность выезда панели чата и расширения дровера — одна, чтобы шли синхронно. */
const CHAT_SLIDE_MS = 300;

type DealDetailDrawerProps = {
  dealId: number | null;
  onClose: () => void;
  onError: (message: string) => void;
  onNotify: (message: string) => void;
  sources: DealDictionaryItem[];
  /** Этапы воронки сделки: смена этапа прямо из карточки. */
  stages: DealStage[];
  lostReasons: DealDictionaryItem[];
  canUpdate: boolean;
  canManage: boolean;
  /** Право правки суммы уже выигранной сделки (`deals.amount_override`). */
  canOverrideAmount: boolean;
};

const ACTIVITY_TYPES: DealActivityType[] = ["call", "message", "visit", "note"];

/**
 * Карточка обращения: деньги, ответственный, касания, история этапов.
 *
 * Деталь приходит одним запросом и, в отличие от списка, заворачивает сделку в
 * `deal` — плюс позиции, касания и два лога. Сумма правится только пока сделка
 * в работе: после выигрыша нужен `deals.amount_override`, у проигранной она не
 * правится вовсе, а при непустых позициях считается по ним.
 */
/** Имя автора записи; бот — с иконкой робота своего цвета. */
const ActorLabel: React.FC<{
  name: string | null;
  kind: "employee" | "bot" | null;
  color: string | null;
}> = ({ name, kind, color }) => {
  if (!name) return null;
  return (
    <Stack direction="row" alignItems="center" gap={0.5} component="span" sx={{ minWidth: 0 }}>
      {kind === "bot" ? <SmartToyOutlined sx={{ fontSize: 13, color: color ?? "text.disabled" }} /> : null}
      <Typography variant="caption" color="text.disabled" noWrap component="span">
        {name}
      </Typography>
    </Stack>
  );
};

const DealDetailDrawer: React.FC<DealDetailDrawerProps> = ({
  dealId,
  onClose,
  onError,
  onNotify,
  sources,
  stages,
  lostReasons,
  canUpdate,
  canManage,
  canOverrideAmount,
}) => {
  const { t } = useT("deals");
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { employees } = useAllActiveEmployees(dealId != null);
  const { can } = useCanChecker();
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"));
  const [pane, setPane] = React.useState<"deal" | "chat">("deal");

  /* Действия ведут в чужие модули, поэтому и права спрашиваем их: у
     регистратора может быть deals.update без tasks.create. */
  const canCreateTask = can("tasks.create") || can("tasks.manage");
  const canCreateAppointment = can("appointments.create") || can("appointments.manage");

  const open = dealId != null;

  const detailQuery = useQuery({
    queryKey: dealId != null ? djangoQueryKeys.deals.detail(dealId) : ["deals", "detail", "none"],
    queryFn: ({ signal }) => getDeal(dealId as number, orgId, signal),
    enabled: open,
  });

  const detail = detailQuery.data;
  const deal = detail?.deal;

  /* Чат показываем только тем, кому открыт раздел «Чаты»: iframe всё равно
     потребует учётку в Чат-центре, а без права незачем и пытаться. */
  const withChat = Boolean(deal?.chatUrl) && can("chatwoot.view");
  /* Панель чата закрыта по умолчанию и выезжает справа по кнопке в карточке:
     iframe Chatwoot тяжёлый, а переписку читают реже, чем правят сделку.
     Закрытие дровера и переход к другой сделке её сворачивают. */
  const [chatOpen, setChatOpen] = React.useState(false);
  const showChat = withChat && chatOpen;
  React.useEffect(() => {
    if (!open) {
      setPane("deal");
      setChatOpen(false);
    }
  }, [open]);
  React.useEffect(() => {
    setChatOpen(false);
    setPane("deal");
  }, [dealId]);
  const openChat = () => {
    setChatOpen(true);
    setPane("chat");
  };
  const hideChat = () => {
    setChatOpen(false);
    setPane("deal");
  };

  const [amount, setAmount] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [activityType, setActivityType] = React.useState<DealActivityType>("call");
  const [activityNote, setActivityNote] = React.useState("");
  const [serviceQuery, setServiceQuery] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  /** Перенос в этап потери ждёт причину: без неё бэк отклонит запрос (400). */
  const [lostStageId, setLostStageId] = React.useState<number | null>(null);
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [appointmentOpen, setAppointmentOpen] = React.useState(false);
  const debouncedServiceQuery = useDebouncedValue(serviceQuery, 350);

  /* Гидратация полей — по узкому ключу, а не по всему объекту сделки: иначе
     любое обновление детали (поллинг доски, чужая правка) затрёт то, что
     пользователь набирает прямо сейчас. */
  const loadedId = deal?.id;
  const loadedAmount = deal?.amount;
  const loadedComment = deal?.comment;
  React.useEffect(() => {
    if (loadedId == null) return;
    setAmount(loadedAmount ?? "");
    setComment(loadedComment ?? "");
  }, [loadedId, loadedAmount, loadedComment]);

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.all });
  }, [queryClient]);

  const patchMutation = useMutation({
    mutationFn: (payload: UpdateDealPayload) => updateDeal(dealId as number, payload, orgId),
    onSuccess: () => {
      onNotify(t("detail.saved"));
      invalidate();
    },
    onError: (error) => onError(dealsErrorMessage(error, t("detail.saveError"))),
  });

  const itemMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "add"; service: Service }
        | { kind: "remove"; itemId: number }
        | { kind: "qty"; itemId: number; quantity: number },
    ): Promise<void> => {
      if (action.kind === "add") {
        await addDealItem(dealId as number, { serviceId: action.service.id, quantity: 1 }, orgId);
        return;
      }
      if (action.kind === "remove") {
        await deleteDealItem(action.itemId, orgId);
        return;
      }
      await updateDealItem(action.itemId, { quantity: action.quantity }, orgId);
    },
    onSuccess: () => invalidate(),
    onError: (error) => onError(dealsErrorMessage(error, t("detail.saveError"))),
  });

  const activityMutation = useMutation({
    mutationFn: () =>
      addDealActivity(dealId as number, { type: activityType, note: activityNote.trim() }, orgId),
    onSuccess: () => {
      setActivityNote("");
      invalidate();
    },
    onError: (error) => onError(dealsErrorMessage(error, t("detail.saveError"))),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDeal(dealId as number, orgId),
    onSuccess: () => {
      onNotify(t("detail.deleted"));
      invalidate();
      onClose();
    },
    onError: (error) => onError(dealsErrorMessage(error, t("detail.saveError"))),
  });

  const servicesQuery = useQuery({
    queryKey: djangoQueryKeys.deals.servicePicker(debouncedServiceQuery, orgId),
    queryFn: ({ signal }) => getServices(orgWide(orgId), { search: debouncedServiceQuery }, signal),
    enabled: open && canUpdate,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const hasItems = (detail?.items.length ?? 0) > 0;
  const closed = deal != null && deal.stageKind !== "open";
  /* Линия пути по этапам: считается из лога переходов, пересчёт — при
     каждом новом ответе детали (перенос, возврат в работу). */
  const segments = React.useMemo(
    () => (detail ? buildStageSegments(detail.stageLog, stages, new Date(), closed) : []),
    [detail, stages, closed],
  );
  /** Пока сделка в работе — сумму правит любой с deals.update; дальше см. контракт §6. */
  const amountEditable =
    deal != null &&
    canUpdate &&
    !hasItems &&
    (deal.stageKind === "open" || (deal.stageKind === "won" && canOverrideAmount));

  const amountHint = hasItems
    ? t("detail.amountFromItems")
    : deal?.stageKind === "lost"
      ? t("detail.amountLockedLost")
      : deal?.stageKind === "won" && !canOverrideAmount
        ? t("detail.amountLocked")
        : " ";

  const saveAmount = () => {
    const normalized = amount.trim().replace(",", ".");
    if (!deal || normalized === deal.amount) return;
    patchMutation.mutate({ amount: normalized });
  };

  const saveComment = () => {
    if (!deal || comment === (deal.comment ?? "")) return;
    patchMutation.mutate({ comment });
  };

  const setAssignee = (value: number | "") => {
    // Очистка — только явным флагом: null бэк читает как «поле не присылали».
    patchMutation.mutate(value === "" ? { clearAssignee: true } : { assigneeId: value });
  };

  const setSource = (value: number | "") => {
    patchMutation.mutate(value === "" ? { clearSource: true } : { sourceId: value });
  };

  const setNextAction = (value: Dayjs | null) => {
    if (value == null) {
      patchMutation.mutate({ clearNextAction: true });
      return;
    }
    if (!value.isValid()) return;
    patchMutation.mutate({ nextActionAt: value.toISOString() });
  };

  /**
   * Смена этапа из карточки — тот же `move/`, что на доске: на телефоне
   * перетаскивания нет, и карточка остаётся единственным способом двинуть
   * обращение. `updatedAt` не отправляем: этап выбран из только что
   * загруженной детали, и осознанный last-write-wins здесь уместнее 409 на
   * ровном месте.
   */
  const moveMutation = useMutation({
    mutationFn: ({ stageId, lostReasonId, note }: { stageId: number; lostReasonId?: number; note?: string }) =>
      moveDealTo(
        dealId as number,
        {
          stageId,
          position: 0,
          ...(lostReasonId != null ? { lostReasonId } : {}),
          ...(note ? { note } : {}),
        },
        orgId,
      ),
    onSuccess: () => {
      onNotify(t("detail.saved"));
      invalidate();
    },
    onError: (error) => onError(dealsErrorMessage(error, t("detail.saveError"))),
  });

  const stageKindOf = (stageId: number) => stages.find((s) => s.id === stageId)?.kind ?? null;

  const startStageChange = (stageId: number) => {
    if (stageId === deal?.stageId) return;
    if (stageKindOf(stageId) === "lost") {
      setLostStageId(stageId);
      return;
    }
    moveMutation.mutate({ stageId });
  };

  /** Возврат закрытой сделки в работу требует deals.manage — иначе 403. */
  const canMoveTo = (stageId: number) => {
    if (!canUpdate && !canManage) return false;
    const to = stageKindOf(stageId);
    if (to == null) return false;
    if (closed && to === "open") return canManage;
    return true;
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          /* Карточке — 560, чату — остаток (~460): панель уже, чем у раздела
             «Чаты», зато полям сделки хватает места. Ширина анимируется вместе
             с выездом панели. */
          width: { xs: "100%", sm: showChat ? DRAWER_WIDTH_WITH_CHAT : DRAWER_WIDTH },
          maxWidth: "100%",
          transition: (theme) => theme.transitions.create("width", { duration: CHAT_SLIDE_MS }),
          overflowX: "hidden",
        },
      }}
    >
      <Stack sx={{ height: "100%" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.5, gap: 1 }}
        >
          <Stack sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              {deal ? <ChannelIcon channel={deal.channel} size={16} /> : null}
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {deal ? deal.patientName || deal.contactName : t("detail.title")}
              </Typography>
            </Stack>
            {deal ? (
              <Stack direction="row" alignItems="center" gap={0.75}>
                {deal.branchName ? (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {deal.branchName}
                  </Typography>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
          <Stack direction="row" gap={0.5}>
            {deal?.phone ? (
              <Tooltip title={t("detail.call")}>
                <IconButton size="small" component="a" href={`tel:${deal.phone}`}>
                  <PhoneOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            {canManage && deal ? (
              <Tooltip title={t("detail.delete")}>
                <IconButton size="small" onClick={() => setConfirmDelete(true)}>
                  <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            <IconButton size="small" onClick={onClose}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Divider />

        {showChat && isNarrow ? (
          <Box sx={{ px: 2, pt: 1 }}>
            <SegmentedTabs<"deal" | "chat">
              tabs={[
                { key: "deal", label: t("detail.dealTab") },
                { key: "chat", label: t("detail.chatTab") },
              ]}
              value={pane}
              onChange={setPane}
              layoutId="deal-drawer-tabs"
            />
          </Box>
        ) : null}

        <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        <Box
          sx={{
            flex: showChat && !isNarrow ? `0 0 ${DEAL_COLUMN_WIDTH}px` : 1,
            minWidth: 0,
            overflowY: "auto",
            px: 2,
            py: 2,
            display: showChat && isNarrow && pane === "chat" ? "none" : "block",
          }}
        >
          {detailQuery.isLoading ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={22} />
            </Stack>
          ) : detailQuery.isError || !deal || !detail ? (
            <Alert severity="error" variant="outlined">
              {t("loadError")}
            </Alert>
          ) : (
            <Stack gap={2.5}>
              <StageTimeline segments={segments} />

              {deal.lostReasonName ? (
                <Alert severity="warning" variant="outlined">
                  {t("detail.lostReason", { name: deal.lostReasonName })}
                </Alert>
              ) : null}

              <Stack gap={1.5}>
                {deal.phone ? (
                  <Typography variant="body2">{formatPhoneDisplay(deal.phone)}</Typography>
                ) : null}

                <TextField
                  select
                  size="small"
                  label={t("detail.stage")}
                  value={deal.stageId}
                  onChange={(e) => startStageChange(Number(e.target.value))}
                  disabled={moveMutation.isPending}
                  fullWidth
                >
                  {stages
                    .filter((s) => s.isActive || s.id === deal.stageId)
                    .map((s) => (
                      <MenuItem key={s.id} value={s.id} disabled={!canMoveTo(s.id)}>
                        {s.name}
                      </MenuItem>
                    ))}
                </TextField>

                <TextField
                  size="small"
                  label={t("detail.amount")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={saveAmount}
                  disabled={!amountEditable || patchMutation.isPending}
                  helperText={amountHint}
                  inputProps={{ inputMode: "decimal" }}
                  fullWidth
                />

                <TextField
                  select
                  size="small"
                  label={t("detail.assignee")}
                  value={deal.assigneeId ?? ""}
                  onChange={(e) => setAssignee(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={!canUpdate || patchMutation.isPending}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {employees.map((e) => (
                    <MenuItem key={e.id} value={e.id}>
                      {e.fullName}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label={t("detail.source")}
                  value={deal.sourceId ?? ""}
                  onChange={(e) => setSource(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={!canUpdate || patchMutation.isPending}
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  {sources
                    .filter((s) => s.isActive || s.id === deal.sourceId)
                    .map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name}
                      </MenuItem>
                    ))}
                </TextField>

                <CustomDateTimePicker
                  label={t("detail.nextAction")}
                  value={deal.nextActionAt ? dayjs(deal.nextActionAt) : null}
                  onChange={setNextAction}
                  disabled={!canUpdate || closed}
                />

                <TextField
                  size="small"
                  label={t("detail.comment")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={saveComment}
                  disabled={!canUpdate}
                  multiline
                  minRows={2}
                  fullWidth
                />
              </Stack>

              {/* Действия в остальную CRM: обращение доводится до записи, не
                  выходя из карточки. */}
              {canCreateTask || canCreateAppointment || withChat ? (
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {withChat && !chatOpen ? (
                    <AppButton
                      size="small"
                      variant="contained"
                      startIcon={<ForumOutlined />}
                      onClick={openChat}
                    >
                      {t("detail.chatOpen")}
                    </AppButton>
                  ) : null}

                  {canCreateTask ? (
                    <AppButton
                      size="small"
                      variant="outlined"
                      startIcon={<AssignmentOutlined />}
                      onClick={() => setTaskOpen(true)}
                    >
                      {t("detail.createTask")}
                    </AppButton>
                  ) : null}

                  {canCreateAppointment ? (
                    /* Запись требует карты клиента: у лида её может не быть,
                       и дровер приёма без пациента не отправится. Кнопку не
                       прячем, а объясняем тултипом — иначе непонятно, почему
                       действия нет. */
                    <Tooltip title={deal.patientId == null ? t("detail.needsPatient") : ""}>
                      <span>
                        <AppButton
                          size="small"
                          variant="outlined"
                          startIcon={<EventAvailableOutlined />}
                          disabled={deal.patientId == null}
                          onClick={() => setAppointmentOpen(true)}
                        >
                          {t("detail.createAppointment")}
                        </AppButton>
                      </span>
                    </Tooltip>
                  ) : null}
                </Stack>
              ) : null}

              <Divider />

              {/* Услуги: цена — снимок прайса на момент добавления. */}
              <Stack gap={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">{t("detail.items")}</Typography>
                  <Typography variant="subtitle2">{formatKGS(deal.amount)}</Typography>
                </Stack>

                {detail.items.map((item) => (
                  <Stack key={item.id} direction="row" alignItems="center" gap={1}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                      {item.name}
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        if (!Number.isFinite(quantity) || quantity < 1) return;
                        itemMutation.mutate({ kind: "qty", itemId: item.id, quantity });
                      }}
                      disabled={!canUpdate || closed}
                      sx={{ width: 74 }}
                      inputProps={{ min: 1, "aria-label": t("detail.itemQuantity") }}
                    />
                    <Typography variant="body2" sx={{ width: 96, textAlign: "right" }} noWrap>
                      {formatKGS(item.total)}
                    </Typography>
                    {canUpdate && !closed ? (
                      <Tooltip title={t("detail.itemRemove")}>
                        <IconButton
                          size="small"
                          onClick={() => itemMutation.mutate({ kind: "remove", itemId: item.id })}
                        >
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </Stack>
                ))}

                {canUpdate && !closed ? (
                  <Autocomplete<Service>
                    size="small"
                    options={servicesQuery.data ?? []}
                    loading={servicesQuery.isFetching}
                    getOptionLabel={(s) => s.name}
                    value={null}
                    /* Поле контролируемое, чтобы после добавления оно очищалось:
                       иначе название добавленной услуги остаётся в строке и
                       фильтрует список для следующей. */
                    inputValue={serviceQuery}
                    onChange={(_e, service) => {
                      if (service) {
                        itemMutation.mutate({ kind: "add", service });
                        setServiceQuery("");
                      }
                    }}
                    onInputChange={(_e, value, reason) => {
                      if (reason !== "reset") setServiceQuery(value);
                    }}
                    renderInput={(props) => (
                      <TextField
                        {...props}
                        label={t("detail.addItem")}
                        InputProps={{
                          ...props.InputProps,
                          startAdornment: <AddOutlined fontSize="small" sx={{ mr: 0.5 }} />,
                        }}
                      />
                    )}
                  />
                ) : null}
              </Stack>

              <Divider />

              {/* Касания: лента и быстрый ввод. */}
              <Stack gap={1}>
                <Typography variant="subtitle2">{t("detail.activities")}</Typography>

                {canUpdate ? (
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <TextField
                      select
                      size="small"
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as DealActivityType)}
                      sx={{ width: 130 }}
                    >
                      {ACTIVITY_TYPES.map((type) => (
                        <MenuItem key={type} value={type}>
                          {DEAL_ACTIVITY_META[type].label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      placeholder={t("detail.activityNote")}
                      value={activityNote}
                      onChange={(e) => setActivityNote(e.target.value)}
                      fullWidth
                    />
                    <AppButton
                      size="small"
                      onClick={() => activityMutation.mutate()}
                      loading={activityMutation.isPending}
                      disabled={!activityNote.trim()}
                    >
                      {t("detail.addActivity")}
                    </AppButton>
                  </Stack>
                ) : null}

                {detail.activities.map((a) => (
                  <Stack key={a.id} gap={0.25} sx={{ py: 0.5 }}>
                    <Stack direction="row" alignItems="baseline" gap={1}>
                      <Typography variant="caption" fontWeight={600}>
                        {DEAL_ACTIVITY_META[a.type]?.label ?? a.type}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {exactMoment(a.occurredAt)}
                      </Typography>
                      <ActorLabel name={a.actorName} kind={a.actorKind} color={a.actorColor} />
                    </Stack>
                    {a.note ? <Typography variant="body2">{a.note}</Typography> : null}
                  </Stack>
                ))}
              </Stack>

              <Divider />

              {/* История этапов: длительность считает бэк (дробные часы). */}
              <Stack gap={1}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <HistoryOutlined fontSize="small" sx={{ color: "text.secondary" }} />
                  <Typography variant="subtitle2">{t("detail.history")}</Typography>
                </Stack>

                {detail.stageLog.map((log) => (
                  <Stack key={log.id} direction="row" alignItems="baseline" gap={1}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                      {log.fromStageName ? `${log.fromStageName} → ${log.toStageName}` : log.toStageName}
                    </Typography>
                    {stageDurationLabel(log.durationHours) ? (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {stageDurationLabel(log.durationHours)}
                      </Typography>
                    ) : null}
                    <ActorLabel name={log.actorName} kind={log.actorKind} color={log.actorColor} />
                    <Typography variant="caption" color="text.disabled" noWrap>
                      {exactMoment(log.enteredAt)}
                    </Typography>
                  </Stack>
                ))}

                {detail.changeLog.length > 0 ? (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>
                      {t("detail.changes")}
                    </Typography>
                    {detail.changeLog.map((log) => (
                      <Stack key={log.id} direction="row" alignItems="baseline" gap={1}>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {log.field === "amount"
                            ? t("detail.changedAmount", {
                                from: formatKGS(log.oldValue ?? "0"),
                                to: formatKGS(log.newValue ?? "0"),
                              })
                            : t("detail.changedAssignee", {
                                from: log.oldValue || "—",
                                to: log.newValue || "—",
                              })}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" noWrap>
                          {log.actorName ?? ""} {exactMoment(log.createdAt)}
                        </Typography>
                      </Stack>
                    ))}
                  </>
                ) : null}

                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    {deal.actorKind === "bot" ? (
                      <SmartToyOutlined sx={{ fontSize: 13, color: deal.actorColor ?? "text.disabled" }} />
                    ) : null}
                    <Typography variant="caption" color="text.disabled">
                      {t("detail.createdBy", { name: deal.createdByName ?? "—" })},{" "}
                      {exactMoment(deal.createdAt)}
                    </Typography>
                  </Stack>
                  {deal.wonAt ? (
                    <Typography variant="caption" color="success.main">
                      {t("detail.wonAt", { value: exactMoment(deal.wonAt) })}
                    </Typography>
                  ) : null}
                  {deal.daysInStage != null && !closed ? (
                    <Typography variant="caption" color="text.disabled">
                      {t("board.inStage", { value: stageAgeLabel(deal.daysInStage) ?? "—" })}
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>
            </Stack>
          )}
        </Box>

        {withChat && deal?.chatUrl && (!isNarrow || pane === "chat") ? (
          <Slide
            in={showChat}
            direction="left"
            timeout={CHAT_SLIDE_MS}
            mountOnEnter
            unmountOnExit
            appear
          >
            <Stack direction="row" sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              {!isNarrow ? <Divider orientation="vertical" flexItem /> : null}
              <Stack sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}
                >
                  <ChannelIcon channel={deal.channel} size={16} />
                  <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {t("detail.chat")}
                    {deal.inboxName ? ` · ${deal.inboxName}` : ""}
                  </Typography>
                  <Tooltip title={t("detail.chatOpenInChats")}>
                    <IconButton size="small" component="a" href="/chats" target="_blank" rel="noopener">
                      <OpenInNewOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t("detail.chatHide")}>
                    <IconButton size="small" onClick={hideChat} aria-label={t("detail.chatHide")}>
                      <KeyboardDoubleArrowRightOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <DealChatPane chatUrl={deal.chatUrl} />
                </Box>
              </Stack>
            </Stack>
          </Slide>
        ) : null}
        </Stack>
      </Stack>

      {/* Задача из карточки: ссылки на сделку у задачи нет (поля на бэке не
          существует), поэтому контекст уходит текстом — по нему исполнитель
          найдёт обращение поиском в воронке. */}
      <CreateTaskDrawer
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        canManage={can("tasks.manage")}
        prefill={
          deal
            ? {
                title: t("detail.taskTitle", {
                  name: deal.patientName || deal.contactName,
                }),
                description: t("detail.taskDescription", {
                  name: deal.patientName || deal.contactName,
                  phone: deal.phone ? formatPhoneDisplay(deal.phone) : "—",
                  stage: deal.stageName,
                  amount: formatKGS(deal.amount),
                }),
              }
            : undefined
        }
      />

      {/* Запись на приём: пациент и первая услуга из сделки. Остальные услуги
          добавляются в самой записи — дровер приёма принимает только одну. */}
      {appointmentOpen && deal?.patientId != null ? (
        <DjangoAddAppointmentDrawer
          open
          onClose={() => setAppointmentOpen(false)}
          initialPatientId={deal.patientId}
          initialServiceId={detail?.items[0]?.serviceId ?? null}
          showAllFieldsInitially
          onCreated={() => {
            setAppointmentOpen(false);
            onNotify(t("detail.appointmentCreated"));
          }}
        />
      ) : null}

      <LostReasonDialog
        open={lostStageId != null}
        reasons={lostReasons}
        dealName={deal ? deal.patientName || deal.contactName : undefined}
        busy={moveMutation.isPending}
        onClose={() => setLostStageId(null)}
        onConfirm={(reasonId, note) => {
          if (lostStageId == null) return;
          moveMutation.mutate({ stageId: lostStageId, lostReasonId: reasonId, note });
          setLostStageId(null);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t("detail.delete")}
        message={t("detail.deleteConfirm", {
          name: deal ? deal.patientName || deal.contactName : "",
        })}
        confirmText={t("detail.delete")}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMutation.mutate();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </Drawer>
  );
};

export default DealDetailDrawer;
