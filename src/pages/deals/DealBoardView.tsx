import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import { Board, type BoardCardSpec, type BoardColumnDef } from "../../components/board";
import { UserAvatar } from "../../components/ui";
import LostReasonDialog from "../../components/deals/LostReasonDialog";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { useT } from "../../i18n/VerticalProvider";
import {
  getDealBoard,
  getMovedDeal,
  moveDealTo,
  type Deal,
  type DealBoard,
  type DealBoardParams,
  type DealDictionaryItem,
  type DealStageKind,
} from "../../api/deals";
import {
  DEALS_COLUMN_SIZE,
  DEALS_REFRESH_MS,
  dealsErrorMessage,
  nextActionLabel,
  stageAgeLabel,
} from "./meta";

type DealBoardViewProps = {
  /** Фильтры страницы; этап задаёт колонка, поэтому stageId сюда не приходит. */
  params: DealBoardParams;
  orgId?: number;
  lostReasons: DealDictionaryItem[];
  onOpenDeal: (dealId: number) => void;
  onError: (message: string) => void;
  canUpdate: boolean;
  /** Возврат закрытой сделки в работу — только с deals.manage (иначе 403). */
  canManage: boolean;
  enabled: boolean;
  emptyState?: React.ReactNode;
};

/** Содержимое карточки: оболочку (drag, меню, анимацию) даёт ядро доски. */
const DealCardBody: React.FC<{ deal: Deal; hasActions: boolean }> = ({ deal, hasActions }) => {
  const { t } = useT("deals");
  const age = stageAgeLabel(deal.daysInStage);
  const action = nextActionLabel(deal.nextActionAt);

  return (
    <>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          pr: hasActions ? 3 : 0,
        }}
      >
        {deal.patientName || deal.contactName}
      </Typography>

      <Stack direction="row" alignItems="baseline" gap={0.75} sx={{ mt: 0.25 }}>
        {deal.phone ? (
          <Typography variant="caption" color="text.secondary" noWrap>
            {formatPhoneDisplay(deal.phone)}
          </Typography>
        ) : null}
        <Box sx={{ flex: 1, minWidth: 4 }} />
        {/* Сумма — главная цифра карточки: воронку смотрят из-за неё. */}
        <Typography variant="caption" fontWeight={600} noWrap>
          {formatKGS(deal.amount)}
        </Typography>
      </Stack>

      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 1 }}>
        {deal.assigneeName ? (
          <>
            <UserAvatar
              name={deal.assigneeName}
              size={22}
              sx={{ borderRadius: "7px", flexShrink: 0 }}
            />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {deal.assigneeName}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.disabled" noWrap>
            {t("board.noAssignee")}
          </Typography>
        )}

        <Box sx={{ flex: 1, minWidth: 8 }} />

        {/* Одна метка времени: просроченное касание важнее возраста карточки. */}
        {action ? (
          <Tooltip title={t("board.actionAt", { value: action })}>
            <Stack direction="row" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }}>
              <AccessTimeOutlined
                sx={{
                  fontSize: 14,
                  color: deal.isActionOverdue ? "error.main" : "text.secondary",
                }}
              />
              <Typography
                variant="caption"
                noWrap
                sx={{
                  fontWeight: deal.isActionOverdue ? 600 : 400,
                  color: deal.isActionOverdue ? "error.main" : "text.secondary",
                }}
              >
                {action}
              </Typography>
            </Stack>
          </Tooltip>
        ) : age ? (
          <Tooltip title={t("board.inStage", { value: age })}>
            <Typography variant="caption" color="text.disabled" noWrap sx={{ flexShrink: 0 }}>
              {age}
            </Typography>
          </Tooltip>
        ) : null}

        {deal.isSlaBreached ? (
          <Tooltip title={t("board.slaBreached", { days: age ?? "—" })}>
            <WarningAmberOutlined sx={{ fontSize: 15, color: "warning.main", flexShrink: 0 }} />
          </Tooltip>
        ) : null}
      </Stack>
    </>
  );
};

/**
 * Доска воронки: колонка — этап, карточка — обращение.
 *
 * Данные приходят одним агрегатом `board/` (в отличие от задач, где запрос на
 * каждую колонку): бэк отдаёт count и amountTotal по всей колонке, а не по
 * загруженному срезу, — именно эти цифры стоят в шапке.
 */
const DealBoardView: React.FC<DealBoardViewProps> = ({
  params,
  orgId,
  lostReasons,
  onOpenDeal,
  onError,
  canUpdate,
  canManage,
  enabled,
  emptyState,
}) => {
  const { t } = useT("deals");
  const queryClient = useQueryClient();
  const [limit, setLimit] = React.useState(DEALS_COLUMN_SIZE);
  /** Перенос в этап потери ждёт причину: карточка поедет только после ответа. */
  const [lostPrompt, setLostPrompt] = React.useState<{ deal: Deal; stageId: number } | null>(null);

  const boardParams: DealBoardParams = React.useMemo(
    () => ({ ...params, limit, organizationId: orgId }),
    [params, limit, orgId],
  );

  const boardKey = React.useMemo(
    () => djangoQueryKeys.deals.board(boardParams as Record<string, unknown>),
    [boardParams],
  );

  const boardQuery = useQuery({
    queryKey: boardKey,
    queryFn: ({ signal }) => getDealBoard(boardParams, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    // Смена фильтра не должна схлопывать доску в скелетоны.
    placeholderData: keepPreviousData,
    refetchInterval: DEALS_REFRESH_MS,
  });

  const board = boardQuery.data;

  /** Кто где лежит сейчас — по агрегату, а не по локальному состоянию. */
  const columnOf = React.useCallback((deal: Deal) => deal.stageId, []);

  const stageKindOf = React.useCallback(
    (stageId: number): DealStageKind | null =>
      board?.columns.find((c) => c.stageId === stageId)?.stageKind ?? null,
    [board],
  );

  const moveMutation = useMutation({
    mutationFn: ({
      deal,
      stageId,
      lostReasonId,
      note,
    }: {
      deal: Deal;
      stageId: number;
      lostReasonId?: number;
      note?: string;
    }) =>
      moveDealTo(
        deal.id,
        {
          stageId,
          position: 0,
          // Версия карточки на экране: сервер ответит 409, если её уже двигали.
          updatedAt: deal.updatedAt,
          ...(lostReasonId != null ? { lostReasonId } : {}),
          ...(note ? { note } : {}),
        },
        orgId,
      ),
    // Карточка переезжает сразу: перенос — это жест, и пауза читается как «не сработало».
    onMutate: async ({ deal, stageId }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const prev = queryClient.getQueryData<DealBoard>(boardKey);
      if (prev) {
        queryClient.setQueryData<DealBoard>(boardKey, {
          ...prev,
          columns: prev.columns.map((column) => {
            if (column.stageId === deal.stageId) {
              return {
                ...column,
                deals: column.deals.filter((d) => d.id !== deal.id),
                count: Math.max(0, column.count - 1),
                amountTotal: sumStrings(column.amountTotal, deal.amount, -1),
              };
            }
            if (column.stageId === stageId) {
              return {
                ...column,
                deals: [
                  { ...deal, stageId, stageName: column.stageName, stageKind: column.stageKind },
                  ...column.deals,
                ],
                count: column.count + 1,
                amountTotal: sumStrings(column.amountTotal, deal.amount, 1),
              };
            }
            return column;
          }),
        });
      }
      return { prev };
    },
    onSuccess: (res) => {
      /* Сервер вернул свежую карточку и итоги двух колонок: кладём их в кэш,
         иначе следующий перенос той же карточки пошлёт устаревший updatedAt и
         поймает 409 на ровном месте. */
      const current = queryClient.getQueryData<DealBoard>(boardKey);
      if (!current) return;
      const totals = new Map(res.columns.map((c) => [c.stageId, c]));
      queryClient.setQueryData<DealBoard>(boardKey, {
        ...current,
        columns: current.columns.map((column) => {
          const t2 = totals.get(column.stageId);
          const deals = column.deals.map((d) => (d.id === res.deal.id ? res.deal : d));
          return t2
            ? { ...column, deals, count: t2.count, amountTotal: t2.amountTotal }
            : { ...column, deals };
        }),
      });
    },
    onError: (error, _vars, snapshot) => {
      // Возвращаем доску к состоянию до переноса — иначе карточка «зависнет»
      // не там, где её на самом деле видит сервер.
      if (snapshot?.prev) queryClient.setQueryData(boardKey, snapshot.prev);
      const moved = getMovedDeal(error);
      if (moved) {
        // При конфликте бэк присылает актуальную сделку: перерисовываем доску
        // по факту сервера, а не гадаем.
        void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.all });
      }
      onError(dealsErrorMessage(error, t("detail.saveError")));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.summary({}) });
    },
  });

  /**
   * Разрешён ли перенос. Переходы между рабочими этапами свободны в обе
   * стороны; возврат закрытой сделки в работу требует deals.manage — колонка
   * гаснет ещё до drop, чтобы не ловить 403 после жеста.
   */
  const canDrop = React.useCallback(
    (deal: Deal, stageId: number) => {
      if (!canUpdate && !canManage) return false;
      if (deal.stageId === stageId) return false;
      const from = deal.stageKind;
      const to = stageKindOf(stageId);
      if (to == null) return false;
      if (from !== "open" && to === "open") return canManage;
      return true;
    },
    [canUpdate, canManage, stageKindOf],
  );

  const startMove = React.useCallback(
    (deal: Deal, stageId: number) => {
      if (!canDrop(deal, stageId)) {
        onError(t("conflict.reopenForbidden"));
        return;
      }
      if (stageKindOf(stageId) === "lost") {
        setLostPrompt({ deal, stageId });
        return;
      }
      moveMutation.mutate({ deal, stageId });
    },
    [canDrop, moveMutation, onError, stageKindOf, t],
  );

  const columns: BoardColumnDef<number>[] = (board?.columns ?? []).map((column) => {
    const shown = column.deals.length;
    return {
      id: column.stageId,
      title: column.stageName,
      dotColor: column.color,
      count: column.count,
      // Сумма по всей колонке — главная цифра для владельца.
      headerMeta: (
        <Typography variant="caption" color="text.secondary" noWrap>
          {formatKGS(column.amountTotal)}
        </Typography>
      ),
      loading: boardQuery.isLoading,
      emptyHint: t("board.emptyColumn"),
      footer:
        column.count > shown ? (
          <Stack alignItems="center" sx={{ py: 1 }}>
            <Typography variant="caption" color="text.disabled">
              {t("board.loadMore", { count: column.count - shown })}
            </Typography>
          </Stack>
        ) : undefined,
      onScrollEnd:
        column.count > shown ? () => setLimit((l) => l + DEALS_COLUMN_SIZE) : undefined,
    };
  });

  const dealsOf = (stageId: number) =>
    board?.columns.find((c) => c.stageId === stageId)?.deals ?? [];

  const card = (deal: Deal): BoardCardSpec => {
    const actions = (board?.columns ?? [])
      .filter((c) => canDrop(deal, c.stageId))
      .map((c) => ({
        key: String(c.stageId),
        label: c.stageName,
        onSelect: () => startMove(deal, c.stageId),
      }));

    return {
      ariaLabel: t("board.cardLabel", { name: deal.patientName || deal.contactName }),
      accentColor: deal.isSlaBreached ? undefined : null,
      alert: deal.isActionOverdue,
      actions,
      actionsTooltip: t("board.moveActions"),
      onOpen: () => onOpenDeal(deal.id),
      content: <DealCardBody deal={deal} hasActions={actions.length > 0} />,
    };
  };

  /* Пустой экран уместен, только если модуль его прислал: при отсутствии
     emptyState ядро рисует колонки, и структура воронки остаётся видна. */
  const isEmpty = emptyState != null && board != null && board.columns.every((c) => c.count === 0);

  return (
    <>
      <Board<Deal, number>
        columns={columns}
        itemsOf={dealsOf}
        getItemId={(deal) => deal.id}
        columnOf={columnOf}
        canDrop={canDrop}
        onDrop={(deal, stageId) => startMove(deal, stageId)}
        card={card}
        dropHint={t("board.dropHint")}
        isEmpty={isEmpty}
        emptyState={emptyState}
      />

      <LostReasonDialog
        open={lostPrompt != null}
        reasons={lostReasons}
        dealName={lostPrompt?.deal.patientName || lostPrompt?.deal.contactName}
        busy={moveMutation.isPending}
        onClose={() => setLostPrompt(null)}
        onConfirm={(reasonId, note) => {
          if (!lostPrompt) return;
          moveMutation.mutate({
            deal: lostPrompt.deal,
            stageId: lostPrompt.stageId,
            lostReasonId: reasonId,
            note,
          });
          setLostPrompt(null);
        }}
      />
    </>
  );
};

/**
 * Сложение денег-строк для оптимистичного итога колонки.
 *
 * Считаем в копейках целыми: суммы приходят decimal-строкой, и обычное
 * сложение float даёт «184000.000000001» в шапке. Значение живёт до ответа
 * сервера — он присылает точные итоги обеих колонок.
 */
function sumStrings(total: string, delta: string, sign: 1 | -1): string {
  const toCents = (v: string) => Math.round(Number(v || "0") * 100);
  const cents = toCents(total) + sign * toCents(delta);
  return (Math.max(0, cents) / 100).toFixed(2);
}

export default DealBoardView;
