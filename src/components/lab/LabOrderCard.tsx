import React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppButton } from "../ui";
import BarcodePreview from "./BarcodePreview";
import {
  dispatchLabOrder,
  getLabOrder,
  getLabOrderLabels,
  getLabPreparation,
  testIdsQuery,
} from "../../api/lab";
import { getPatient } from "../../api/patients";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import {
  buildLabelsHtml,
  buildPreparationHtml,
  buildTicketHtml,
  looksLikePngBase64,
  printHtml,
  type LabelData,
} from "../../utility/labLabels";
import { labOrderDispatchStatus, labOrderLisPrintBlockReason } from "../../utility/labOrderStatus";
import { formatDateRu, formatKGS } from "../../utility/format";

const POPUP_BLOCKED_MESSAGE =
  "Браузер заблокировал окно печати — разрешите всплывающие окна для этой страницы и повторите";

/**
 * ЛИС отдаёт регистрационный лист сериализованным `JasperPrint`, а не
 * картинкой (см. `labLabels.ts`/`looksLikePngBase64`, `lab-intake-live-
 * findings.md`, находка 17). Кнопка остаётся живой и реально ходит в ЛИС —
 * если бэкенд однажды научится конвертировать лист в картинку, печать
 * заработает сама; до тех пор регистратор должен увидеть внятную причину, а
 * не битую картинку в окне печати.
 */
const TICKET_NOT_AN_IMAGE_MESSAGE =
  "ЛИС отдаёт регистрационный лист не картинкой, а служебным форматом — известное ограничение вендора. Напечатать его пока нельзя.";

export interface LabOrderCardProps {
  /** Заказ, который открыт карточкой. `null` — карточка закрыта, запросов нет. */
  orderId: number | null;
  open: boolean;
  onClose: () => void;
  canViewFinance: boolean;
  /** Право `lab.accept` — им же ограничен приём, design.md называет его условием повтора отправки. */
  canRetryDispatch: boolean;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.4 }}>
    {children}
  </Typography>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode; bold?: boolean }> = ({
  label,
  value,
  bold,
}) => (
  <Stack direction="row" justifyContent="space-between" gap={2}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={bold ? 700 : 500} sx={{ textAlign: "right" }}>
      {value}
    </Typography>
  </Stack>
);

const ItemRow: React.FC<{ title: string; tag?: string | null; count: number; price: string }> = ({
  title,
  tag,
  count,
  price,
}) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    gap={1.5}
    sx={{ px: 1.5, py: 1, border: 1, borderColor: "divider", borderRadius: "10px" }}
  >
    <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={500} noWrap>
        {title}
      </Typography>
      {tag && <Chip size="small" label={tag} sx={{ height: 20, fontSize: "0.65rem" }} />}
    </Stack>
    <Stack direction="row" alignItems="center" gap={2} flexShrink={0}>
      {count !== 1 && (
        <Typography variant="caption" color="text.secondary">
          × {count}
        </Typography>
      )}
      <Typography variant="body2" fontWeight={600}>
        {formatKGS(price)}
      </Typography>
    </Stack>
  </Stack>
);

/**
 * Карточка заказа лаборатории — просмотр целиком плюс печать трёх форм.
 *
 * Самостоятельно грузит свои данные (заказ, дату рождения пациента для
 * печати, тексты подготовки), как `LabIntakeDrawer` — секции лаборатории не
 * знают про API, а вот сами дроверы/карточки этого раздела делают запросы
 * сами. Логика, которую стоит проверять без рендера (статус, блокировка
 * печати), вынесена в `utility/labOrderStatus.ts` и `labLabels.ts`.
 *
 * Неотправленный заказ (`pending_dispatch`) — сегодня основной случай, а не
 * редкий: ЛИС недоступна с сервера, и каждый приём заканчивается им же. Для
 * такого заказа печать этикеток и регистрационного листа задизейблена
 * (`labOrderLisPrintBlockReason` — без `lisOrderId` в ЛИС физически нечего
 * забирать), а вместо неё карточка объясняет причину и даёт кнопку повтора.
 * Памятка подготовки сюда не входит: она собирается из своего каталога по
 * `testId` строк заказа и ЛИС не касается, поэтому доступна независимо от
 * статуса отправки — иначе регистратор не смог бы напечатать её вовсе, пока
 * ЛИС недоступна (а это сейчас всегда).
 */
const LabOrderCard: React.FC<LabOrderCardProps> = ({
  orderId,
  open,
  onClose,
  canViewFinance,
  canRetryDispatch,
}) => {
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: djangoQueryKeys.lab.order(orderId ?? 0),
    queryFn: ({ signal }) => getLabOrder(orderId!, signal),
    enabled: open && orderId != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const order = orderQuery.data ?? null;

  // Дата рождения пациента нужна только для шапки печатных форм — сам заказ
  // её не отдаёт (контракт `GET /lab/orders/<id>/` ограничен именами и
  // суммами). Тот же справочный ключ, что и у карточки пациента: если
  // страница уже открывала этого пациента, второй запрос не понадобится.
  const patientQuery = useQuery({
    queryKey: djangoQueryKeys.patients.detail(order?.patientId ?? 0),
    queryFn: () => getPatient(order!.patientId),
    enabled: open && order != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const lineTestIds = React.useMemo(() => order?.lines.map((l) => l.testId) ?? [], [order]);
  const idsKey = React.useMemo(() => testIdsQuery(lineTestIds), [lineTestIds]);
  const preparationQuery = useQuery({
    queryKey: djangoQueryKeys.lab.preparation(idsKey),
    queryFn: ({ signal }) => getLabPreparation(lineTestIds, signal),
    enabled: open && order != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const [printBusy, setPrintBusy] = React.useState<"labels" | "ticket" | null>(null);
  const [printMessage, setPrintMessage] = React.useState<string | null>(null);

  // Штрихкод на экране — тот же живой вызов ЛИС, что и печать этикеток, но
  // один раз на открытие карточки и только для отправленного заказа: у
  // неотправленного номера ещё нет, и ЛИС ответила бы отказом.
  const barcodeQuery = useQuery({
    queryKey: [...djangoQueryKeys.lab.all, "labels", orderId],
    queryFn: () => getLabOrderLabels(orderId as number),
    enabled: open && orderId != null && order?.isDispatched === true,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: false,
  });

  // Сообщения предыдущего заказа не должны пережить переключение на другой —
  // иначе чужая ошибка печати повиснет над только что открытым заказом.
  React.useEffect(() => {
    setRetryError(null);
    setPrintMessage(null);
    setPrintBusy(null);
  }, [orderId, open]);

  const handleRetry = async () => {
    if (!order) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await dispatchLabOrder(order.id);
      // Повтор мог и на этот раз упереться в недоступную ЛИС — тогда бэкенд
      // ответит отказом, и catch ниже покажет причину, не трогая фазу: заказ
      // остаётся оплаченным и неотправленным, как и был.
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.lab.all });
    } catch (err) {
      setRetryError(getErrorMessage(err, "Не удалось повторить отправку"));
    } finally {
      setRetrying(false);
    }
  };

  const labelData = (barcodeBase64: string): LabelData => ({
    patientName: order?.patientName ?? "",
    birthDate: formatDateRu(patientQuery.data?.birthDate ?? null),
    orderCode: order?.lisOrderCode ?? null,
    barcodeBase64,
  });

  /** Этикетки и регистрационный лист — оба идут через один и тот же живой вызов ЛИС. */
  const handleLisPrint = async (kind: "labels" | "ticket") => {
    if (!order) return;
    setPrintMessage(null);
    setPrintBusy(kind);
    try {
      const labels = await getLabOrderLabels(order.id);
      if (kind === "labels") {
        setPrintMessage(printHtml(buildLabelsHtml(labelData(labels.barcodeBase64))) ? null : POPUP_BLOCKED_MESSAGE);
      } else if (!looksLikePngBase64(labels.ticketBase64)) {
        // Не открываем окно печати с битой картинкой — см. TICKET_NOT_AN_IMAGE_MESSAGE.
        setPrintMessage(TICKET_NOT_AN_IMAGE_MESSAGE);
      } else {
        const html = buildTicketHtml({ ...labelData(labels.barcodeBase64), ticketBase64: labels.ticketBase64 });
        setPrintMessage(printHtml(html) ? null : POPUP_BLOCKED_MESSAGE);
      }
    } catch (err) {
      // 502 (ЛИС недоступна на момент печати) и любой другой отказ — не
      // открываем пустое окно печати, показываем причину (см. задачу).
      setPrintMessage(getErrorMessage(err, "Не удалось получить данные для печати из ЛИС"));
    } finally {
      setPrintBusy(null);
    }
  };

  const handlePrintPreparation = () => {
    if (!order) return;
    const html = buildPreparationHtml(labelData(""), preparationQuery.data ?? []);
    setPrintMessage(printHtml(html) ? null : POPUP_BLOCKED_MESSAGE);
  };

  const status = order ? labOrderDispatchStatus(order.isDispatched) : null;
  const printBlockReason = order ? labOrderLisPrintBlockReason(order.lisOrderId) : null;
  // isSuccess, а не "не isLoading": пока запрос ещё не подтвердил успех явно
  // (в том числе в момент, когда enabled только что стал true и isLoading на
  // v5 react-query на один тик остаётся false), кнопка обязана быть
  // заблокирована — иначе клик в эту щель напечатает пустую памятку вместо
  // настоящей (см. buildPreparationHtml: пустой список печатает заглушку
  // «Особой подготовки не требуется», а это неправда, если тексты просто ещё
  // не загрузились).
  const preparationReady = preparationQuery.isSuccess;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={retrying ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 520, md: 620, lg: 680 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5, flexShrink: 0 }}>
        <Typography variant="h6" fontWeight={600}>
          Заказ №{order ? order.lisOrderCode ?? order.id : orderId ?? ""}
        </Typography>
        <IconButton onClick={retrying ? undefined : onClose} aria-label="Закрыть" edge="end" disabled={retrying}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
        {orderQuery.isLoading ? (
          <Stack spacing={1.5}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={40} />
            ))}
          </Stack>
        ) : orderQuery.isError ? (
          <Alert
            severity="error"
            action={
              <AppButton size="small" variant="outlined" onClick={() => orderQuery.refetch()}>
                Повторить
              </AppButton>
            }
          >
            {getErrorMessage(orderQuery.error, "Не удалось загрузить заказ")}
          </Alert>
        ) : order && status ? (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={status.label} color={status.color} />
              {order.isDispatched && order.dispatchedAt && (
                <Typography variant="caption" color="text.secondary">
                  {dayjs(order.dispatchedAt).format("DD.MM.YYYY HH:mm")}
                </Typography>
              )}
            </Stack>

            {!order.isDispatched && (
              <Alert severity="warning">
                <Stack spacing={0.5}>
                  <Typography fontWeight={600}>Оплачено, не отправлено</Typography>
                  <Typography variant="body2">
                    Деньги приняты, заказ не уехал в лабораторию.{" "}
                    {order.dispatchError ? `Причина: ${order.dispatchError}` : "Причина не указана."}
                  </Typography>
                  {retryError && (
                    <Typography variant="body2" color="error.main">
                      Повтор не удался: {retryError}
                    </Typography>
                  )}
                </Stack>
              </Alert>
            )}

            <Stack spacing={0.5}>
              <InfoRow label="Пациент" value={order.patientName} />
              <InfoRow label="Филиал" value={order.branchName} />
              <InfoRow label="Дата приёма" value={dayjs(order.createdAt).format("DD.MM.YYYY HH:mm")} />
              <InfoRow
                label="Согласие на обработку ПДн"
                value={
                  order.personalDataConsentAt
                    ? `получено ${formatDateRu(order.personalDataConsentAt)}`
                    : "не отмечено"
                }
              />
              {order.referringDoctorName && (
                <InfoRow
                  label="Направивший врач"
                  value={order.referringDoctorName}
                />
              )}
              {order.diagnosis && <InfoRow label="Диагноз" value={order.diagnosis} />}
              {order.comment && <InfoRow label="Комментарий" value={order.comment} />}
            </Stack>

            <Divider />

            <Box>
              <SectionTitle>Состав</SectionTitle>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {order.lines.map((line) => (
                  <ItemRow
                    key={line.id}
                    title={line.titleSnapshot}
                    tag={line.isExpress ? "экспресс" : null}
                    count={line.countItem}
                    price={line.price}
                  />
                ))}
              </Stack>
            </Box>

            {order.instruments.length > 0 && (
              <Box>
                <SectionTitle>Пробирки</SectionTitle>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {order.instruments.map((item) => (
                    <ItemRow key={item.id} title={item.titleSnapshot} count={item.count} price={item.price} />
                  ))}
                </Stack>
              </Box>
            )}

            {canViewFinance && (
              <>
                <Divider />
                <Box>
                  <SectionTitle>Оплата</SectionTitle>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <InfoRow label="Итого" value={formatKGS(order.totalAmount)} bold />
                    {order.discountPercent > 0 && <InfoRow label="Скидка" value={`${order.discountPercent}%`} />}
                    {order.paidCash > 0 && <InfoRow label="Наличными" value={formatKGS(order.paidCash)} />}
                    {order.paidCard > 0 && <InfoRow label="Картой" value={formatKGS(order.paidCard)} />}
                  </Stack>
                </Box>
              </>
            )}

            <Divider />

            <Box>
              <SectionTitle>Штрихкод и печать</SectionTitle>
              {order.isDispatched && (
                <Box sx={{ mt: 1 }}>
                  {barcodeQuery.data ? (
                    <BarcodePreview
                      barcodeBase64={barcodeQuery.data.barcodeBase64}
                      orderCode={order.lisOrderCode}
                    />
                  ) : barcodeQuery.isError ? (
                    <Typography variant="caption" color="text.secondary">
                      Штрихкод сейчас не получить: ЛИС не ответила. Печать
                      попробует ещё раз.
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Запрашиваем штрихкод в ЛИС…
                    </Typography>
                  )}
                </Box>
              )}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <Tooltip title={printBlockReason ?? ""}>
                  <span>
                    <AppButton
                      size="small"
                      variant="outlined"
                      disabled={!!printBlockReason}
                      loading={printBusy === "labels"}
                      onClick={() => handleLisPrint("labels")}
                    >
                      Этикетки
                    </AppButton>
                  </span>
                </Tooltip>
                <Tooltip title={printBlockReason ?? ""}>
                  <span>
                    <AppButton
                      size="small"
                      variant="outlined"
                      disabled={!!printBlockReason}
                      loading={printBusy === "ticket"}
                      onClick={() => handleLisPrint("ticket")}
                    >
                      Регистрационный лист
                    </AppButton>
                  </span>
                </Tooltip>
                <Tooltip title={preparationQuery.isError ? "Не удалось загрузить памятку подготовки" : ""}>
                  <span>
                    <AppButton size="small" variant="outlined" disabled={!preparationReady} onClick={handlePrintPreparation}>
                      Памятка подготовки
                    </AppButton>
                  </span>
                </Tooltip>
              </Stack>
              {printMessage && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  {printMessage}
                </Alert>
              )}
            </Box>
          </Stack>
        ) : null}
      </Box>
      <Divider />

      <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ px: 2.5, py: 1.5, flexShrink: 0 }} gap={1}>
        <AppButton variant="text" onClick={onClose} disabled={retrying}>
          Закрыть
        </AppButton>
        {order && !order.isDispatched && canRetryDispatch && (
          <AppButton variant="contained" onClick={handleRetry} loading={retrying}>
            Повторить отправку
          </AppButton>
        )}
      </Stack>
    </Drawer>
  );
};

export default LabOrderCard;
