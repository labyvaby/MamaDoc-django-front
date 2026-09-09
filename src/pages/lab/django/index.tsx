import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useNotification } from "@refinedev/core";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";

import { AppButton, ListEmptyState, ListLoadingSkeleton, PageHeader } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { ApiError, isAbortError } from "../../../api/client";
import { getLabOrders, type LabOrder } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import LabOrdersSummaryBar, { type LabOrdersFilter } from "../../../components/lab/LabOrdersSummaryBar";
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
  const { open: notify } = useNotification();
  const { loading: permLoading } = usePermissions();
  const canView = useCan("lab.view");
  const canViewFinance = useCan("finance.view");

  const [searchParams] = useSearchParams();
  // LabIntakeDrawer появится в Task 10 и примет этот id, чтобы открыться сразу
  // на нужном пациенте. Сейчас дровера нет, поэтому пока только читаем
  // параметр и объясняем это в подсказке у кнопки — открывать пока нечего.
  const intakePatientId = useMemo(
    () => parsePatientId(searchParams.get("patientId")),
    [searchParams],
  );

  const [filter, setFilter] = useState<LabOrdersFilter>("all");
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOrders = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await getLabOrders({}, controller.signal);
      setOrders(data);
    } catch (e) {
      if (isAbortError(e)) return;
      console.error(e);
      const message = e instanceof ApiError ? e.message : "Не удалось загрузить заказы";
      setError(message);
      notify?.({ type: "error", message });
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (permLoading || !canView) return;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, canView]);

  // Плитки и фильтр — над одним и тем же снимком ленты: переключение плитки
  // не бьёт по сети, только меняет срез уже загруженного списка.
  const stats = useMemo(() => labOrderStats(orders), [orders]);
  const visibleOrders = useMemo(() => filterLabOrders(orders, filter), [orders, filter]);

  if (!permLoading && !canView) return <AccessDenied />;

  const intakeHint =
    intakePatientId != null
      ? "Форма приёма для этого пациента появится здесь в следующей задаче"
      : "Форма приёма анализов появится в следующей задаче";

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
              <AppButton variant="contained" size="large" startIcon={<AddOutlined />} disabled>
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

        {loading ? (
          <Paper variant="outlined" elevation={0} sx={{ overflow: "hidden" }}>
            <ListLoadingSkeleton rows={8} />
          </Paper>
        ) : error ? (
          <Paper variant="outlined" elevation={0} sx={{ minHeight: 240, display: "flex" }}>
            <ListEmptyState
              icon={<ErrorOutlineOutlined />}
              title="Не удалось загрузить заказы"
              description={error}
              action={
                <AppButton variant="outlined" size="small" onClick={() => void fetchOrders()}>
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
    </Box>
  );
};

export default DjangoLabPage;
