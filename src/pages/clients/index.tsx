import React from "react";
import { Box, CircularProgress, IconButton, InputAdornment, MenuItem, Select, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CakeOutlined from "@mui/icons-material/CakeOutlined";
import ClearOutlined from "@mui/icons-material/ClearOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { AppBottomSheet, PageHeader, SegmentedTabs, cascadeContainer, cascadeItem } from "../../components/ui";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { usePermissions } from "../../hooks/usePermissions";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import type { AttachmentOwner } from "../../api/attachments";
import { getClients, getClientStatuses, type DjangoClient } from "../../api/clients";
import { getClientPurchases, type ClientPurchase } from "../../api/retail";
import CardAttachmentsPanel from "../../components/attachments/CardAttachmentsPanel";
import { useCardAttachments } from "../../components/attachments/useCardAttachments";
import { ReceiptDetailDrawer } from "../pos/ReceiptDetailDrawer";
import ClientCard from "./ClientCard";
import ClientEditorDrawer from "./ClientEditorDrawer";
import ClientListPanel from "./ClientListPanel";
import ClientPurchaseHistoryCard from "./ClientPurchaseHistoryCard";
import { defaultClientLayoutSettings, getClientLayoutSettings, type ClientLayoutSettings } from "./clientLayout";

const MotionBox = motion(Box);

type DetailTab = "card" | "purchases" | "files";
type DesktopTab = "purchases" | "files";

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const name = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(2020, index, 1));
  return { value: index + 1, label: name.charAt(0).toUpperCase() + name.slice(1) };
});

export default function ClientsPage() {
  const auth = usePermissions();
  const queryClient = useQueryClient();
  const theme = useTheme();
  // Брейкпоинты проекта нестандартные (sm = 360): телефон — всё, что уже md.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const isDesktop = !isMobile && !isTablet;
  const organizationId = auth.activeOrganization?.id ?? null;
  const canView = auth.isSuperAdmin() || auth.hasPermission("clients.view");
  // Права гранулярные, как у пациентов: заводить и править — разные галочки.
  const canCreate = auth.isSuperAdmin() || auth.hasPermission("clients.create");
  const canUpdate = auth.isSuperAdmin() || auth.hasPermission("clients.update");
  // Блоки кассы — через canAccess (модуль + право): без модуля «Касса» у
  // организации (и в «Меню как у клиники») их нет, как и данных на бэке.
  const canViewFinance = auth.canAccess("pos.view") || auth.canAccess("pos.sell");
  const canViewPurchaseHistory = auth.canAccess("pos.history");

  usePageTitle("Все клиенты");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [birthMonth, setBirthMonth] = React.useState<number | "">("");
  const [selected, setSelected] = React.useState<DjangoClient | null>(null);
  const [editorClient, setEditorClient] = React.useState<DjangoClient | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<ClientLayoutSettings>(defaultClientLayoutSettings);
  const [detailTab, setDetailTab] = React.useState<DetailTab>("card");
  // Десктоп: карточка — своей колонкой, справа покупки и файлы вкладками.
  const [desktopTab, setDesktopTab] = React.useState<DesktopTab>("purchases");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // Чек держим и после закрытия — иначе дровер пустеет на анимации выезда.
  const [openedPurchase, setOpenedPurchase] = React.useState<ClientPurchase | null>(null);
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);
  const openPurchase = React.useCallback((purchase: ClientPurchase) => { setOpenedPurchase(purchase); setPurchaseOpen(true); }, []);
  const [searchParams, setSearchParams] = useSearchParams();

  const closeMobile = React.useCallback(() => setMobileOpen(false), []);
  useSheetBackClose(mobileOpen && isMobile, closeMobile, isMobile);

  const layoutQuery = useQuery({
    queryKey: ["client-layout-settings", organizationId],
    queryFn: ({ signal }) => getClientLayoutSettings(organizationId as number, signal),
    enabled: Boolean(organizationId && canView),
  });

  React.useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 250); return () => window.clearTimeout(timer); }, [search]);
  React.useEffect(() => {
    const next = layoutQuery.data ?? defaultClientLayoutSettings;
    setLayout(next);
  }, [layoutQuery.data]);

  const clients = useQuery({
    queryKey: ["clients", organizationId, debouncedSearch, birthMonth],
    queryFn: ({ signal }) => getClients(organizationId as number, { query: debouncedSearch, birthMonth: birthMonth || null }, signal),
    enabled: Boolean(organizationId && canView),
  });
  const statuses = useQuery({
    queryKey: ["client-statuses", organizationId],
    queryFn: ({ signal }) => getClientStatuses(organizationId as number, signal),
    enabled: Boolean(organizationId && canView),
    staleTime: 5 * 60 * 1000,
  });

  const selectClient = React.useCallback((client: DjangoClient) => {
    setSelected(client);
    setDetailTab("card");
    if (isMobile) setMobileOpen(true);
  }, [isMobile]);

  React.useEffect(() => { if (!selected) return; const fresh = clients.data?.find((row) => row.id === selected.id); if (fresh) setSelected(fresh); }, [clients.data, selected?.id]);
  React.useEffect(() => {
    const raw = Number(searchParams.get("client"));
    if (!raw || !clients.data) return;
    const found = clients.data.find((row) => row.id === raw);
    if (found) selectClient(found);
    setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete("client"); return next; }, { replace: true });
  }, [clients.data, searchParams, setSearchParams, selectClient]);

  const purchases = useQuery({ queryKey: ["client-purchases", organizationId, selected?.id], queryFn: ({ signal }) => getClientPurchases(selected!.id, signal), enabled: Boolean(selected && canViewPurchaseHistory) });

  // Файлы карточки: панель грузит их сама, а тот же запрос даёт счётчик на вкладке.
  const selectedId = selected?.id ?? null;
  const attachmentsOwner = React.useMemo<AttachmentOwner | null>(
    () => (selectedId !== null && organizationId ? { kind: "client", id: selectedId, organizationId } : null),
    [selectedId, organizationId],
  );
  const attachments = useCardAttachments(attachmentsOwner);

  const openCreate = () => { setEditorClient(null); setEditorOpen(true); };
  const openEdit = () => { if (selected) { setEditorClient(selected); setEditorOpen(true); } };
  const onClientSaved = (saved: DjangoClient) => { setSelected(saved); void queryClient.invalidateQueries({ queryKey: ["clients", organizationId] }); };

  if (auth.loading) return <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}><CircularProgress /></Box>;
  if (!canView) return <AccessDenied />;

  const cardSettings = { ...layout, sections: { ...layout.sections, finance: layout.sections.finance && canViewFinance } };

  const cardNode = <ClientCard client={selected} settings={cardSettings} canUpdate={canUpdate} onEdit={openEdit} />;
  const historyNode = (
    <ClientPurchaseHistoryCard
      purchases={purchases.data}
      loading={purchases.isLoading}
      error={purchases.error instanceof Error ? purchases.error.message : null}
      canViewPurchases={canViewPurchaseHistory}
      onOpen={openPurchase}
    />
  );
  const filesNode = <CardAttachmentsPanel owner={attachmentsOwner} canManage={canUpdate} />;
  const purchasesTab = { key: "purchases" as const, label: "Покупки", icon: <ShoppingBagOutlined />, badge: purchases.data?.length || undefined };
  const filesTab = { key: "files" as const, label: "Файлы", icon: <FolderOutlined />, badge: attachments.data?.length || undefined };
  const detailTabs: Array<{ key: DetailTab; label: string; icon: React.ReactElement; badge?: number }> = [
    { key: "card", label: "Карточка", icon: <PersonOutlineOutlined /> },
    ...(canViewPurchaseHistory ? [purchasesTab] : []),
    filesTab,
  ];
  const activeTab: DetailTab = detailTabs.some((tab) => tab.key === detailTab) ? detailTab : "card";
  const detailNode = activeTab === "card" ? cardNode : activeTab === "purchases" ? historyNode : filesNode;
  const desktopTabs: Array<{ key: DesktopTab; label: string; icon: React.ReactElement; badge?: number }> = [purchasesTab, filesTab];
  const noSelection = (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper", p: 3, textAlign: "center" }}>
      <Box>
        <PersonOutlineOutlined color="disabled" sx={{ fontSize: 36, mb: 1 }} />
        <Typography color="text.secondary">Выберите клиента, чтобы открыть карточку</Typography>
      </Box>
    </Box>
  );

  const birthMonthFilter = (
    <Select
      size="small"
      displayEmpty
      value={birthMonth}
      onChange={(event) => setBirthMonth(event.target.value === "" ? "" : Number(event.target.value))}
      aria-label="Месяц рождения"
      renderValue={() => (birthMonth === "" ? (isMobile ? "ДР" : "Все месяцы ДР") : MONTHS[birthMonth - 1]?.label)}
      startAdornment={<InputAdornment position="start"><CakeOutlined fontSize="small" color={birthMonth === "" ? "action" : "primary"} /></InputAdornment>}
      endAdornment={birthMonth !== "" ? (
        <InputAdornment position="end" sx={{ mr: 2 }}>
          <IconButton size="small" aria-label="Сбросить месяц" onClick={() => setBirthMonth("")} onMouseDown={(event) => event.stopPropagation()}>
            <ClearOutlined fontSize="small" />
          </IconButton>
        </InputAdornment>
      ) : undefined}
      MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
      sx={(t) => ({
        // Та же высота, что у поля поиска рядом: строка шапки ровная.
        height: t.appLayout.controls.inputHeight,
        minWidth: { xs: 112, md: 210 },
        maxWidth: { xs: 150, md: 240 },
        flexShrink: 0,
        ...(birthMonth !== "" ? { "& .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" } } : {}),
      })}
    >
      <MenuItem value="">Все месяцы рождения</MenuItem>
      {MONTHS.map((month) => <MenuItem key={month.value} value={month.value}>{month.label}</MenuItem>)}
    </Select>
  );

  return <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <PageHeader
      title="Клиенты"
      showTitle={false}
      onAdd={canCreate ? openCreate : undefined}
      addButtonText="Добавить клиента"
      addButtonIcon={<AddOutlined />}
      showSearch
      searchVal={search}
      onSearchChange={setSearch}
      searchPlaceholder="Имя, телефон или email"
      loading={clients.isFetching}
      actions={birthMonthFilter}
      compactMobile
    />

    <MotionBox
      variants={cascadeContainer}
      initial="hidden"
      animate="show"
      sx={(t) => ({ px: t.appLayout.page.paddingX, pb: 1.5, flex: 1, minHeight: 0, display: "flex", gap: 2, overflow: "hidden" })}
    >
      <MotionBox variants={cascadeItem} sx={{ flex: isMobile ? "1 1 auto" : isTablet ? "5 1 0" : "3 1 0", minWidth: 0, height: "100%" }}>
        <ClientListPanel
          clients={clients.data ?? []}
          selectedId={selected?.id ?? null}
          loading={clients.isLoading}
          fetching={clients.isFetching}
          error={clients.error instanceof Error ? clients.error.message : null}
          filtered={Boolean(debouncedSearch.trim() || birthMonth)}
          onSelect={selectClient}
        />
      </MotionBox>

      {/* Планшет: одна правая колонка с вкладками Карточка / Покупки */}
      {isTablet && (
        <MotionBox variants={cascadeItem} sx={{ flex: "7 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
          {selected ? (
            <>
              {detailTabs.length > 1 && (
                <Box sx={{ flexShrink: 0, mb: 1.5 }}>
                  <SegmentedTabs layoutId="clients-tablet-tabs" tabs={detailTabs} value={activeTab} onChange={setDetailTab} />
                </Box>
              )}
              <Box sx={{ flex: 1, minHeight: 0 }}>{detailNode}</Box>
            </>
          ) : noSelection}
        </MotionBox>
      )}

      {/* Десктоп: три колонки — список, карточка, история покупок */}
      {isDesktop && (
        <>
          <MotionBox variants={cascadeItem} sx={{ flex: "3.5 1 0", minWidth: 0, height: "100%" }}>
            {selected ? cardNode : noSelection}
          </MotionBox>
          <MotionBox variants={cascadeItem} sx={{ flex: "5.5 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
            {selected ? (
              canViewPurchaseHistory ? (
                <>
                  <Box sx={{ flexShrink: 0, mb: 1.5 }}>
                    <SegmentedTabs layoutId="clients-desktop-right-tabs" tabs={desktopTabs} value={desktopTab} onChange={setDesktopTab} />
                  </Box>
                  <Box sx={{ flex: 1, minHeight: 0 }}>{desktopTab === "purchases" ? historyNode : filesNode}</Box>
                </>
              ) : filesNode
            ) : (
              <Box sx={{ height: "100%", display: "grid", placeItems: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
                <Typography color="text.secondary">{canViewPurchaseHistory ? "Покупки и файлы клиента" : "Файлы клиента"}</Typography>
              </Box>
            )}
          </MotionBox>
        </>
      )}
    </MotionBox>

    {/* Телефон: карточка и покупки — в нижнем листе с вкладками */}
    {isMobile && (
      <AppBottomSheet
        open={mobileOpen && Boolean(selected)}
        onClose={closeMobile}
        fullHeight
        header={detailTabs.length > 1 ? (
          <Box sx={{ px: 1.5, py: 1 }}>
            <SegmentedTabs layoutId="clients-mobile-tabs" tabs={detailTabs} value={activeTab} onChange={setDetailTab} />
          </Box>
        ) : undefined}
      >
        <Box sx={{ p: 1.5, height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={{ flex: 1, minHeight: 0 }}>{detailNode}</Box>
        </Box>
      </AppBottomSheet>
    )}

    <ReceiptDetailDrawer receipt={openedPurchase} open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    <ClientEditorDrawer open={editorOpen} organizationId={organizationId} client={editorClient} statuses={statuses.data ?? []} onClose={() => setEditorOpen(false)} onSaved={onClientSaved} />
  </Box>;
}
