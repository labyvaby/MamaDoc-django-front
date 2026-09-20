import React from "react";
import { Alert, Box, Button, Stack, Tooltip, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AddAPhotoOutlined from "@mui/icons-material/AddAPhotoOutlined";

import { getErrorMessage } from "../../api/client";
import {
  PROCUREMENT_PERMISSIONS as P,
  cancelReceipt,
  deletePayment,
  getPayments,
  getProcurementSettings,
  getReceipt,
  getReceipts,
  getReceiptsSummary,
  getReturns,
  getSuppliers,
  updateReceipt,
  type GoodsReceipt,
  type ProcurementScope,
  type ProcurementSupplier,
  type ReceiptListStatus,
  type SupplierPayment,
} from "../../api/procurement";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { getWarehouses } from "../../api/warehouse";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useCanChecker } from "../../hooks/useCan";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFocusRefetch } from "../../hooks/useFocusRefetch";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { AppBottomSheet, MonthNavigation, PageHeader, ReasonDialog, SegmentedTabs } from "../../components/ui";
import { PaymentsList, ReturnsList } from "../../components/procurement/DocumentLists";
import { ProcurementStatTiles } from "../../components/procurement/ProcurementStatTiles";
import { ReceiptDetails } from "../../components/procurement/ReceiptDetails";
import { ReceiptFormDrawer } from "../../components/procurement/ReceiptFormDrawer";
import { ReceiptHeaderDialog } from "../../components/procurement/ReceiptHeaderDialog";
import { ReceiptList } from "../../components/procurement/ReceiptList";
import { SupplierFormDrawer } from "../../components/procurement/SupplierFormDrawer";
import { SupplierPaymentDialog } from "../../components/procurement/SupplierPaymentDialog";
import { SupplierReturnDrawer } from "../../components/procurement/SupplierReturnDrawer";
import { SuppliersGrid } from "../../components/procurement/SuppliersGrid";
import { formatMoney } from "../../components/procurement/meta";
import { printReceipt } from "../../components/procurement/printReceipt";

type Tab = "invoices" | "returns" | "payments" | "suppliers";

const ADD_LABEL: Record<Tab, string> = {
  invoices: "Новая накладная",
  returns: "Новый возврат",
  payments: "Новая оплата",
  suppliers: "Новый поставщик",
};

const SEARCH_PLACEHOLDER: Record<Tab, string> = {
  invoices: "Поиск по номеру, поставщику…",
  returns: "Поиск по номеру, поставщику…",
  payments: "Поиск по поставщику, документу…",
  suppliers: "Поиск по названию, ИНН, телефону…",
};

/**
 * Страница «Накладные» — приход от поставщиков, возвраты, оплаты и справочник
 * поставщиков. Скоуп страницы: организация + активный филиал (бэк сужает
 * списки по складам филиала и его оплатам). Каждая кнопка — своё право
 * (PROCUREMENT_PERMISSIONS), общее procurement.manage — надмножество.
 */
const InvoicesPage: React.FC = () => {
  usePageTitle("Накладные");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const { organizationId, branchId, isReady, orgReady } = useActiveScope();
  const { activeBranch } = usePermissions();
  const { can } = useCanChecker();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const scope = React.useMemo<ProcurementScope>(
    () => ({ organizationId: organizationId ?? null, branchId: branchId ?? null }),
    [organizationId, branchId],
  );
  const scopeReady = isReady && orgReady;
  const keyScope = { orgId: organizationId ?? null, branchId: branchId ?? null };

  const perms = {
    create: can([P.receiptCreate, P.manage]),
    update: can([P.receiptUpdate, P.manage]),
    cancel: can([P.receiptCancel, P.manage]),
    photos: can([P.receiptPhotos, P.manage]),
    recognize: can([P.receiptRecognize, P.manage]),
    returns: can([P.returnCreate, P.manage]),
    suppliers: can([P.suppliersManage, P.manage]),
    pay: can(P.paymentsManage),
    deletePayment: can(P.paymentsDelete),
    print: can(P.print),
  };

  // ── Состояние страницы ───────────────────────────────────────────────────
  const [tab, setTab] = React.useState<Tab>("invoices");
  const [month, setMonth] = React.useState<Dayjs>(dayjs().startOf("month"));
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = React.useState<ReceiptListStatus | "all">("all");
  const [supplierFilter, setSupplierFilter] = React.useState<number | null>(null);
  const [warehouseFilter, setWarehouseFilter] = React.useState<number | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const [receiptFormOpen, setReceiptFormOpen] = React.useState(false);
  const [returnFor, setReturnFor] = React.useState<{ open: boolean; receipt: GoodsReceipt | null }>({ open: false, receipt: null });
  const [payFor, setPayFor] = React.useState<{ open: boolean; receipt: GoodsReceipt | null; supplier: ProcurementSupplier | null }>({
    open: false,
    receipt: null,
    supplier: null,
  });
  const [supplierForm, setSupplierForm] = React.useState<{ open: boolean; supplier: ProcurementSupplier | null }>({ open: false, supplier: null });
  const [headerFor, setHeaderFor] = React.useState<GoodsReceipt | null>(null);
  const [cancelFor, setCancelFor] = React.useState<GoodsReceipt | null>(null);
  const [cancelBusy, setCancelBusy] = React.useState(false);

  const dateFrom = month.format("YYYY-MM-DD");
  const dateTo = month.endOf("month").format("YYYY-MM-DD");
  const periodLabel = month.format("MMMM YYYY");
  const scopeLabel = activeBranch ? `филиал ${activeBranch.name}` : "все филиалы";

  // ── Данные ───────────────────────────────────────────────────────────────
  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.summary({ ...keyScope, dateFrom, dateTo }),
    queryFn: ({ signal }) => getReceiptsSummary({ dateFrom, dateTo }, scope, signal),
    enabled: scopeReady,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const receiptsQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.receipts({ ...keyScope, dateFrom, dateTo, status, supplierFilter, warehouseFilter, search: debouncedSearch }),
    queryFn: ({ signal }) =>
      getReceipts(
        {
          status: status === "all" ? null : status,
          supplierId: supplierFilter,
          warehouseId: warehouseFilter,
          dateFrom,
          dateTo,
          search: debouncedSearch,
          withLines: false,
          limit: 500,
        },
        scope,
        signal,
      ),
    enabled: scopeReady && tab === "invoices",
    placeholderData: keepPreviousData,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const receiptQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.receipt(selectedId ?? 0, keyScope),
    queryFn: ({ signal }) => getReceipt(selectedId!, scope, signal),
    enabled: scopeReady && selectedId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const receiptPaymentsQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.payments({ ...keyScope, goodsReceiptId: selectedId }),
    queryFn: ({ signal }) => getPayments({ goodsReceiptId: selectedId, limit: 500 }, { organizationId: scope.organizationId }, signal),
    enabled: scopeReady && selectedId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const suppliersQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.suppliers({ orgId: keyScope.orgId, search: tab === "suppliers" ? debouncedSearch : "" }),
    queryFn: ({ signal }) => getSuppliers({ search: tab === "suppliers" ? debouncedSearch : undefined }, scope, signal),
    enabled: scopeReady,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const returnsQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.returns({ ...keyScope, dateFrom, dateTo }),
    queryFn: ({ signal }) => getReturns({ dateFrom, dateTo, limit: 500 }, scope, signal),
    enabled: scopeReady && tab === "returns",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const paymentsQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.payments({ ...keyScope, dateFrom, dateTo }),
    queryFn: ({ signal }) => getPayments({ dateFrom, dateTo, limit: 500 }, scope, signal),
    enabled: scopeReady && tab === "payments",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.procurement.settings(keyScope.orgId),
    queryFn: ({ signal }) => getProcurementSettings(scope, signal),
    enabled: scopeReady,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const warehousesQuery = useQuery({
    queryKey: ["django", "procurement", "form-warehouses", keyScope.orgId],
    queryFn: ({ signal }) => getWarehouses(signal, organizationId),
    enabled: scopeReady,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  useFocusRefetch(() => {
    if (scopeReady) void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });
  });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: djangoQueryKeys.procurement.all });

  const receipts = React.useMemo(() => receiptsQuery.data ?? [], [receiptsQuery.data]);
  const suppliers = suppliersQuery.data ?? [];
  const selected = receiptQuery.data ?? receipts.find((r) => r.id === selectedId) ?? null;
  const settings = settingsQuery.data;
  const recognitionEnabled = perms.recognize && Boolean(settings?.photoRecognition) && Boolean(settings?.recognitionAvailable);
  const recognitionHint = !perms.recognize
    ? "Нет права на распознавание накладных."
    : settings && !settings.photoRecognition
      ? "Распознавание выключено в настройках модуля «Закупки»."
      : settings && !settings.recognitionAvailable
        ? "Распознавание не настроено на сервере — фото сохранится к накладной."
        : null;

  // Первая накладная — выбрана сама (десктоп); на телефоне лист открывается кликом.
  React.useEffect(() => {
    if (isMobile || receipts.length === 0) return;
    if (selectedId == null || !receipts.some((r) => r.id === selectedId)) setSelectedId(receipts[0].id);
  }, [receipts, selectedId, isMobile]);

  const openReceipt = (id: number) => {
    setTab("invoices");
    setSelectedId(id);
    if (isMobile) setSheetOpen(true);
  };

  const handleSelect = (receipt: GoodsReceipt) => {
    setSelectedId(receipt.id);
    if (isMobile) setSheetOpen(true);
  };

  // ── Действия ─────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (tab === "invoices") setReceiptFormOpen(true);
    else if (tab === "returns") setReturnFor({ open: true, receipt: null });
    else if (tab === "payments") setPayFor({ open: true, receipt: null, supplier: null });
    else setSupplierForm({ open: true, supplier: null });
  };

  const canAdd =
    tab === "invoices" ? perms.create : tab === "returns" ? perms.returns : tab === "payments" ? perms.pay : perms.suppliers;

  const handleCancelReceipt = async (reason: string) => {
    if (!cancelFor) return;
    setCancelBusy(true);
    try {
      await cancelReceipt(cancelFor.id, reason, scope);
      notify?.({ type: "success", message: `Накладная ${cancelFor.number} отменена, товар снят со склада` });
      setCancelFor(null);
      await invalidateAll();
    } catch (e) {
      notify?.({ type: "error", message: getErrorMessage(e, "Не удалось отменить накладную") });
    } finally {
      setCancelBusy(false);
    }
  };

  const handleDeletePayment = async (payment: SupplierPayment) => {
    const ok = await confirm({
      title: "Удалить оплату?",
      message: `${formatMoney(payment.amount)} сом · ${payment.supplierName}${payment.goodsReceiptNumber ? ` · по накладной ${payment.goodsReceiptNumber}` : ""}. Задолженность поставщику вырастет на эту сумму.`,
      confirmText: "Удалить",
      variant: "error",
    });
    if (!ok) return;
    try {
      await deletePayment(payment.id, scope);
      notify?.({ type: "success", message: "Оплата удалена" });
      await invalidateAll();
    } catch (e) {
      notify?.({ type: "error", message: getErrorMessage(e, "Не удалось удалить оплату") });
    }
  };

  const handleSaveHeader = async (receipt: GoodsReceipt, data: Parameters<typeof updateReceipt>[1]) => {
    await updateReceipt(receipt.id, data, scope);
    await invalidateAll();
    notify?.({ type: "success", message: "Накладная сохранена" });
  };

  const detailsProps = {
    receipt: selected,
    loading: selectedId != null && receiptQuery.isLoading && !selected,
    payments: receiptPaymentsQuery.data ?? [],
    paymentsLoading: receiptPaymentsQuery.isLoading,
    organizationId: organizationId ?? null,
    can: {
      pay: perms.pay,
      deletePayment: perms.deletePayment,
      returnGoods: perms.returns,
      edit: perms.update,
      cancel: perms.cancel,
      photos: perms.photos,
      print: perms.print,
    },
    onPay: () => selected && setPayFor({ open: true, receipt: selected, supplier: null }),
    onReturn: () => selected && setReturnFor({ open: true, receipt: selected }),
    onEdit: () => selected && setHeaderFor(selected),
    onCancel: () => selected && setCancelFor(selected),
    onPrint: () => selected && printReceipt(selected, receiptPaymentsQuery.data ?? []),
    onDeletePayment: handleDeletePayment,
  };

  const filterSuppliers = suppliers.map((s) => ({ id: s.id, label: s.name }));
  const filterWarehouses = (warehousesQuery.data ?? []).map((w) => ({ id: w.id, label: w.isLinked ? `${w.name} · ${w.branchName}` : w.name }));

  const tabs = [
    { key: "invoices" as Tab, label: "Накладные", icon: <ReceiptLongOutlined />, badge: summaryQuery.data?.periodCount },
    { key: "returns" as Tab, label: "Возвраты", icon: <UndoOutlined />, badge: returnsQuery.data?.length },
    { key: "payments" as Tab, label: "Оплаты", icon: <PaymentsOutlined />, badge: paymentsQuery.data?.length },
    { key: "suppliers" as Tab, label: "Поставщики", icon: <StorefrontOutlined />, badge: summaryQuery.data?.suppliersTotal },
  ];

  return (
    <Box
      sx={(t) => ({
        height: {
          xs: "auto",
          md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        overflow: { xs: "visible", md: "hidden" },
      })}
    >
      <PageHeader
        title="Накладные"
        showTitle={false}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder={SEARCH_PLACEHOLDER[tab]}
        onAdd={canAdd ? handleAdd : undefined}
        addButtonText={ADD_LABEL[tab]}
        addButtonIcon={tab === "payments" ? <PaymentsOutlined /> : <AddOutlined />}
        actions={
          tab === "invoices" && perms.create && recognitionEnabled ? (
            <Tooltip title="Сфотографировать накладную — форма заполнится сама">
              <Button variant="outlined" startIcon={<AddAPhotoOutlined />} onClick={() => setReceiptFormOpen(true)} sx={{ whiteSpace: "nowrap" }}>
                По фото
              </Button>
            </Tooltip>
          ) : undefined
        }
      />

      <Stack spacing={1.5} sx={{ px: 2, pb: 2, flex: 1, minHeight: 0 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }} justifyContent="space-between">
          <SegmentedTabs layoutId="procurement-tabs" tabs={tabs} value={tab} onChange={setTab} />
          <Box sx={{ minWidth: 0, overflow: "hidden" }}>
            <MonthNavigation date={month.format("YYYY-MM-DD")} setDate={(d) => setMonth(dayjs(d).startOf("month"))} />
          </Box>
        </Stack>

        {summaryQuery.isError && (
          <Alert severity="error">{getErrorMessage(summaryQuery.error, "Не удалось загрузить сводку по закупкам")}</Alert>
        )}

        {(tab === "invoices" || tab === "payments") && (
          <ProcurementStatTiles summary={summaryQuery.data} loading={summaryQuery.isLoading} periodLabel={periodLabel} />
        )}

        {tab === "invoices" && (
          <Box sx={{ display: "flex", gap: 2, flex: 1, minHeight: 0, flexDirection: { xs: "column", md: "row" } }}>
            <Box sx={{ flex: { xs: "1 1 auto", md: "0 0 41.66%" }, minWidth: 0, minHeight: { xs: 320, md: 0 }, display: "flex", flexDirection: "column" }}>
              <ReceiptList
                receipts={receipts}
                loading={receiptsQuery.isLoading}
                errorMessage={receiptsQuery.isError ? getErrorMessage(receiptsQuery.error, "Ошибка загрузки") : null}
                summary={summaryQuery.data}
                selectedId={selectedId}
                onSelect={handleSelect}
                status={status}
                onStatusChange={setStatus}
                supplierId={supplierFilter}
                onSupplierChange={setSupplierFilter}
                suppliers={filterSuppliers}
                warehouseId={warehouseFilter}
                onWarehouseChange={setWarehouseFilter}
                warehouses={filterWarehouses}
                periodLabel={periodLabel}
                scopeLabel={scopeLabel}
                onAdd={perms.create ? () => setReceiptFormOpen(true) : undefined}
              />
            </Box>
            {!isMobile && (
              <Box sx={{ flex: "1 1 0", minWidth: 0, minHeight: 0 }}>
                <ReceiptDetails {...detailsProps} />
              </Box>
            )}
          </Box>
        )}

        {tab === "returns" && (
          <Box sx={{ display: "flex", flex: 1, minHeight: { xs: 320, md: 0 } }}>
            <ReturnsList
              returns={returnsQuery.data ?? []}
              loading={returnsQuery.isLoading}
              errorMessage={returnsQuery.isError ? getErrorMessage(returnsQuery.error, "Ошибка загрузки") : null}
              periodLabel={periodLabel}
              onAdd={perms.returns ? () => setReturnFor({ open: true, receipt: null }) : undefined}
            />
          </Box>
        )}

        {tab === "payments" && (
          <Box sx={{ display: "flex", flex: 1, minHeight: { xs: 320, md: 0 } }}>
            <PaymentsList
              payments={paymentsQuery.data ?? []}
              loading={paymentsQuery.isLoading}
              errorMessage={paymentsQuery.isError ? getErrorMessage(paymentsQuery.error, "Ошибка загрузки") : null}
              periodLabel={periodLabel}
              canDelete={perms.deletePayment}
              onDelete={handleDeletePayment}
              onAdd={perms.pay ? () => setPayFor({ open: true, receipt: null, supplier: null }) : undefined}
              onOpenReceipt={openReceipt}
            />
          </Box>
        )}

        {tab === "suppliers" && (
          <Box sx={{ display: "flex", flex: 1, minHeight: { xs: 320, md: 0 } }}>
            <SuppliersGrid
              suppliers={suppliers}
              loading={suppliersQuery.isLoading}
              errorMessage={suppliersQuery.isError ? getErrorMessage(suppliersQuery.error, "Ошибка загрузки") : null}
              canManage={perms.suppliers}
              canPay={perms.pay}
              onAdd={perms.suppliers ? () => setSupplierForm({ open: true, supplier: null }) : undefined}
              onEdit={(supplier) => setSupplierForm({ open: true, supplier })}
              onPay={(supplier) => setPayFor({ open: true, receipt: null, supplier })}
              onShowReceipts={(supplier) => {
                setSupplierFilter(supplier.id);
                setStatus("all");
                setTab("invoices");
              }}
            />
          </Box>
        )}
      </Stack>

      {/* Мобильный лист с карточкой накладной */}
      {isMobile && (
        <AppBottomSheet open={sheetOpen && selectedId != null} onClose={() => setSheetOpen(false)} fullHeight>
          <ReceiptDetails {...detailsProps} onClose={() => setSheetOpen(false)} />
        </AppBottomSheet>
      )}

      <ReceiptFormDrawer
        open={receiptFormOpen}
        onClose={() => setReceiptFormOpen(false)}
        onCreated={(created) => {
          setReceiptFormOpen(false);
          setStatus("all");
          setMonth(dayjs(created.receivedAt).startOf("month"));
          openReceipt(created.id);
        }}
        scope={scope}
        activeBranchId={activeBranch?.id ?? null}
        suppliers={suppliers}
        recognitionEnabled={recognitionEnabled}
        recognitionHint={recognitionHint}
        onCreateSupplier={perms.suppliers ? () => setSupplierForm({ open: true, supplier: null }) : undefined}
      />

      <SupplierReturnDrawer
        open={returnFor.open}
        onClose={() => setReturnFor({ open: false, receipt: null })}
        scope={scope}
        activeBranchId={activeBranch?.id ?? null}
        suppliers={suppliers}
        receipt={returnFor.receipt}
      />

      <SupplierPaymentDialog
        open={payFor.open}
        onClose={() => setPayFor({ open: false, receipt: null, supplier: null })}
        scope={scope}
        branchId={activeBranch?.id ?? null}
        suppliers={suppliers}
        receipt={payFor.receipt}
        supplier={payFor.supplier}
      />

      <SupplierFormDrawer
        open={supplierForm.open}
        onClose={() => setSupplierForm({ open: false, supplier: null })}
        scope={scope}
        supplier={supplierForm.supplier}
      />

      <ReceiptHeaderDialog receipt={headerFor} onClose={() => setHeaderFor(null)} onSave={handleSaveHeader} />

      <ReasonDialog
        open={cancelFor != null}
        title={cancelFor ? `Отменить накладную ${cancelFor.number}?` : "Отменить накладную?"}
        description="Партии будут обнулены обратным движением, товар уйдёт со склада. Отменить можно только нетронутую поставку без оплат и возвратов."
        label="Причина отмены"
        confirmText="Отменить накладную"
        loading={cancelBusy}
        onCancel={() => setCancelFor(null)}
        onConfirm={(reason) => void handleCancelReceipt(reason)}
      />

      <ConfirmDialog />
    </Box>
  );
};

export default InvoicesPage;
