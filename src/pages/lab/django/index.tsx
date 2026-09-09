import React, { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";

import { AppButton, ListEmptyState, ListLoadingSkeleton, PageHeader } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { getErrorMessage } from "../../../api/client";
import { getLabOrders, type LabOrder } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import LabOrdersSummaryBar, { type LabOrdersFilter } from "../../../components/lab/LabOrdersSummaryBar";
import LabIntakeDrawer from "../../../components/lab/LabIntakeDrawer";
import { filterLabOrders, labOrderStats } from "./labOrderStats";

const headCellSx = { fontWeight: 700, bgcolor: "background.paper" };

/**
 * `?patientId=` в адресе — так на эту страницу приходит кнопка «Принять
 * анализы» из истории пациента (см. `PatientLabOrdersPanel`, Task 12).
 * Мусор в параметре (не число) не должен ронять страницу — просто не
 * распознаём пациента.
 */
function parsePatientId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

const DjangoLabPage: React.FC = () => {
  usePageTitle("Лаборатория");
  const { loading: permLoading } = usePermissions();
  const canView = useCan("lab.view");
  const canViewFinance = useCan("finance.view");
  const canAccept = useCan("lab.accept");

  const [searchParams] = useSearchParams();
  // Из истории пациента кнопка «Принять анализы» ведёт сюда с этим
  // параметром — LabIntakeDrawer (Task 10) принимает его и открывается сразу
  // на нужном пациенте.
  const intakePatientId = useMemo(
    () => parsePatientId(searchParams.get("patientId")),
    [searchParams],
  );
  // Ленивая инициализация — открыт сразу, если пришли по ссылке с
  // ?patientId=; повторный рендер с тем же параметром дровер уже не закроет.
  const [drawerOpen, setDrawerOpen] = useState(() => intakePatientId != null);

  const [filter, setFilter] = useState<LabOrdersFilter>("all");

  // Лента всегда шлёт на сервер пустые params — плитки ниже режут уже
  // загруженный список на клиенте (см. комментарий у visibleOrders), сеть
  // им не нужна. Ключ всё равно параметризован по образцу соседних list():
  // дровер приёма (Task 10) инвалидирует ленту через djangoQueryKeys.lab.all
  // и должен пережить появление серверных фильтров, если они понадобятся.
  const ordersQuery = useQuery<LabOrder[]>({
    queryKey: djangoQueryKeys.lab.orders({}),
    queryFn: ({ signal }) => getLabOrders({}, signal),
    enabled: !permLoading && canView,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  // useMemo, а не голое `?? []`: иначе на каждом рендере до первых данных
  // рождался бы новый пустой массив, и useMemo ниже (stats/visibleOrders)
  // пересчитывались бы вхолостую — тот же приём, что в AchievementsPage
  // для feedItems.
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);

  // Плитки и фильтр — над одним и тем же снимком ленты: переключение плитки
  // не бьёт по сети, только меняет срез уже загруженного списка.
  const stats = useMemo(() => labOrderStats(orders), [orders]);
  const visibleOrders = useMemo(() => filterLabOrders(orders, filter), [orders, filter]);

  if (!permLoading && !canView) return <AccessDenied />;

  const intakeHint = canAccept ? "" : "Недостаточно прав для приёма анализов";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Лаборатория"
        showTitle={false}
        actions={
          <Tooltip title={intakeHint}>
            {/* disabled-кнопка не получает события мыши, Tooltip требует
                обёртку, которая их получает — иначе подсказка не всплывёт. */}
            <span>
              <AppButton
                variant="contained"
                size="large"
                startIcon={<AddOutlined />}
                disabled={!canAccept}
                onClick={() => setDrawerOpen(true)}
              >
                Принять анализы
              </AppButton>
            </span>
          </Tooltip>
        }
      />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pb: t.appLayout.page.paddingY,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "auto",
        })}
      >
        <LabOrdersSummaryBar
          stats={stats}
          value={filter}
          onChange={setFilter}
          canViewFinance={canViewFinance}
        />

        {ordersQuery.isLoading ? (
          <Paper variant="outlined" elevation={0} sx={{ overflow: "hidden" }}>
            <ListLoadingSkeleton rows={8} />
          </Paper>
        ) : ordersQuery.isError ? (
          <Paper variant="outlined" elevation={0} sx={{ minHeight: 240, display: "flex" }}>
            <ListEmptyState
              icon={<ErrorOutlineOutlined />}
              title="Не удалось загрузить заказы"
              description={getErrorMessage(ordersQuery.error, "Не удалось загрузить заказы")}
              action={
                <AppButton variant="outlined" size="small" onClick={() => ordersQuery.refetch()}>
                  Повторить
                </AppButton>
              }
            />
          </Paper>
        ) : visibleOrders.length === 0 ? (
          <Paper variant="outlined" elevation={0} sx={{ minHeight: 240, display: "flex" }}>
            <ListEmptyState
              icon={<ScienceOutlined />}
              title={orders.length === 0 ? "Заказов пока нет" : "Нет неотправленных заказов"}
              description={
                orders.length === 0
                  ? "Лента заполнится после первого приёма анализов."
                  : "Все принятые заказы уже ушли в лабораторию."
              }
            />
          </Paper>
        ) : (
          <Paper variant="outlined" elevation={0} sx={{ overflow: "hidden" }}>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCellSx}>Дата</TableCell>
                    <TableCell sx={headCellSx}>Пациент</TableCell>
                    <TableCell sx={headCellSx}>Филиал</TableCell>
                    <TableCell sx={headCellSx}>Состав</TableCell>
                    {canViewFinance && (
                      <TableCell sx={headCellSx} align="right">
                        Сумма
                      </TableCell>
                    )}
                    <TableCell sx={headCellSx}>№ в ЛИС</TableCell>
                    <TableCell sx={headCellSx}>Статус</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleOrders.map((order) => {
                    const composition = order.titles.join(", ") || "—";
                    return (
                      <TableRow key={order.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {dayjs(order.createdAt).format("DD.MM.YYYY HH:mm")}
                        </TableCell>
                        <TableCell>{order.patientName}</TableCell>
                        <TableCell>{order.branchName}</TableCell>
                        <TableCell>
                          <Tooltip title={composition}>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
                              {composition}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        {canViewFinance && (
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatKGS(order.totalAmount)}
                          </TableCell>
                        )}
                        <TableCell>{order.lisOrderCode ?? "—"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={order.isDispatched ? "Отправлен" : "Оплачен, не отправлен"}
                            color={order.isDispatched ? "success" : "warning"}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>

      <LabIntakeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initialPatientId={intakePatientId}
      />
    </Box>
  );
};

export default DjangoLabPage;
