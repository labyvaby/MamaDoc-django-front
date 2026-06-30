import React from "react";
import {
  Box,
  Card,
  CardContent,
  Button,
  Paper,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  InputAdornment,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Avatar,
  Divider,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import MedicalServicesIcon from "@mui/icons-material/MedicalServicesOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import { AppButton } from "../../components/ui";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { getServices, deleteService } from "../../api/catalog";
import type { Service, BranchRef } from "../../api/catalog";
import { formatKGS } from "../../utility/format";
import DjangoAddServiceDrawer from "../../components/services/DjangoAddServiceDrawer";
import DjangoEditServiceDrawer from "../../components/services/DjangoEditServiceDrawer";
import DjangoServiceQuickViewDrawer from "../../components/services/DjangoServiceQuickViewDrawer";

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "priceAsc" | "priceDesc" | "duration";

const BATCH_SIZE = 20;

/** Форматирует длительность из минут в вид «45 мин» / «1 ч 15 мин». */
function formatDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

const DjangoServicesPage: React.FC = () => {
  usePageTitle("Услуги");
  const { open: notify } = useNotification();
  const { hasPermission, activeOrganization, activeMembership, activeBranch } = usePermissions();

  const canView = hasPermission("catalog.view");
  const canCreate = hasPermission("catalog.create");
  const canUpdate = hasPermission("catalog.update");
  const canDelete = hasPermission("catalog.delete");

  // Данные
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [allServices, setAllServices] = React.useState<Service[]>([]);

  // Инфинит-скролл
  const [visibleCount, setVisibleCount] = React.useState(BATCH_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Drawers
  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selectedServiceId, setSelectedServiceId] = React.useState<number | null>(null);
  const [editingRec, setEditingRec] = React.useState<Service | null>(null);

  // Подтверждение удаления
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmRow, setConfirmRow] = React.useState<Service | null>(null);

  // Поиск, фильтры, сортировка
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [branchFilter, setBranchFilter] = React.useState<number | "all">("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");

  const orgId = activeOrganization?.id ?? null;
  const membershipId = activeMembership?.id ?? null;
  const activeBranchId = activeBranch?.id ?? null;

  // Unique key per tenant context — changes trigger a reload with stale-data clear
  const contextKey = `${orgId ?? "null"}_${membershipId ?? "null"}_${activeBranchId ?? "null"}`;

  // Monotone sequence counter: each load gets an id; only the latest may commit
  const loadSeqRef = React.useRef(0);
  const abortCtrlRef = React.useRef<AbortController | null>(null);
  // Ref updated synchronously on every render so async callbacks can compare
  // against the current context key rather than a stale closure value.
  const currentContextKeyRef = React.useRef<string>(contextKey);
  currentContextKeyRef.current = contextKey;

  // Single loader: aborts previous request, guards against stale write
  const loadAll = React.useCallback(
    async (capturedContextKey: string) => {
      abortCtrlRef.current?.abort();
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;
      const seq = ++loadSeqRef.current;

      setLoading(true);
      setErrorMsg(null);
      // Clear stale data immediately so old org's data is never shown
      setAllServices([]);

      try {
        const svcs = await getServices(activeBranchId, ctrl.signal);
        // Discard result if a newer load started or context changed since request started
        if (seq !== loadSeqRef.current) return;
        if (capturedContextKey !== currentContextKeyRef.current) return;
        setAllServices(svcs);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (seq !== loadSeqRef.current) return;
        if (capturedContextKey !== currentContextKeyRef.current) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        // Only clear loading for the current request, not a superseded one
        if (
          seq === loadSeqRef.current
          && !ctrl.signal.aborted
          && capturedContextKey === currentContextKeyRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [activeBranchId, contextKey],
  );

  // Single effect — fires whenever tenant context changes
  React.useEffect(() => {
    // Immediately close stale drawers and clear UI state
    setDetailsOpen(false);
    setSelectedServiceId(null);
    setEditOpen(false);
    setEditingRec(null);
    setConfirmOpen(false);
    setConfirmRow(null);
    setVisibleCount(BATCH_SIZE);
    setSearchQuery("");
    setStatusFilter("all");
    setBranchFilter("all");
    setSortKey("name");

    void loadAll(contextKey);

    return () => {
      abortCtrlRef.current?.abort();
    };
  }, [contextKey, loadAll]);

  // Список филиалов для дропдауна — уникальные филиалы из загруженных услуг
  const branchOptions = React.useMemo<BranchRef[]>(() => {
    const map = new Map<number, string>();
    for (const s of allServices) {
      for (const b of s.branches) {
        if (!map.has(b.id)) map.set(b.id, b.name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    );
  }, [allServices]);

  // Если выбранный филиал исчез после перезагрузки данных — сбросить
  React.useEffect(() => {
    if (branchFilter !== "all" && !branchOptions.some((b) => b.id === branchFilter)) {
      setBranchFilter("all");
    }
  }, [branchOptions, branchFilter]);

  // Фильтрация: поиск + статус + филиал
  const filtered = React.useMemo(() => {
    const lower = searchQuery.trim().toLowerCase();
    return allServices.filter((s) => {
      if (lower && !s.name.toLowerCase().includes(lower)) return false;
      if (statusFilter === "active" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;
      if (branchFilter !== "all" && !s.branches.some((b) => b.id === branchFilter)) return false;
      return true;
    });
  }, [allServices, searchQuery, statusFilter, branchFilter]);

  // Сортировка
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "priceAsc":
        arr.sort((a, b) => Number(a.basePrice) - Number(b.basePrice));
        break;
      case "priceDesc":
        arr.sort((a, b) => Number(b.basePrice) - Number(a.basePrice));
        break;
      case "duration":
        arr.sort((a, b) => a.durationMinutes - b.durationMinutes);
        break;
      case "name":
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
        break;
    }
    return arr;
  }, [filtered, sortKey]);

  const visibleServices = React.useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" || statusFilter !== "all" || branchFilter !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setBranchFilter("all");
  };

  // Reset visible count when filters/sort/search change
  React.useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [searchQuery, statusFilter, branchFilter, sortKey]);

  // IntersectionObserver — подгрузка при скролле
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) =>
            prev >= sorted.length ? prev : Math.min(prev + BATCH_SIZE, sorted.length),
          );
        }
      },
      { root: scrollContainerRef.current, rootMargin: "200px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef, sorted.length]);

  const handleEdit = (row: Service) => {
    setEditingRec(row);
    setEditOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmRow) return;
    try {
      await deleteService(confirmRow.id);
      void loadAll(contextKey);
      notify?.({ type: "success", message: "Услуга удалена" });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Не удалось удалить услугу" });
    } finally {
      setConfirmOpen(false);
      setConfirmRow(null);
    }
  };

  // Двухстрочная строка списка (вариант 1): миниатюра · название+мета · цена/статус/действия
  const ServiceListItem: React.FC<{ s: Service }> = ({ s }) => {
    const canEditThis = canUpdate && !s.hasHiddenBranches;
    const canDeleteThis = canDelete && !s.hasHiddenBranches;
    const branchNames = s.branches.map((b) => b.name).join(", ");

    return (
      <Box
        onClick={() => {
          setSelectedServiceId(s.id);
          setDetailsOpen(true);
        }}
        sx={{
          px: 2,
          py: 1.5,
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Stack direction="row" alignItems="center" gap={1.75}>
          {/* Миниатюра */}
          <Avatar
            variant="rounded"
            src={s.imageUrl ?? undefined}
            sx={{
              width: 48,
              height: 48,
              flexShrink: 0,
              bgcolor: "action.hover",
              opacity: s.isActive ? 1 : 0.5,
            }}
          >
            <MedicalServicesIcon fontSize="small" sx={{ color: "text.disabled" }} />
          </Avatar>

          {/* Название + метаданные */}
          <Stack sx={{ minWidth: 0, flex: 1 }} gap={0.25}>
            <Typography
              variant="subtitle1"
              noWrap
              sx={{ fontWeight: 500, opacity: s.isActive ? 1 : 0.6 }}
            >
              {s.name || "Без названия"}
            </Typography>

            <Stack
              direction="row"
              alignItems="center"
              gap={0.75}
              sx={{ color: "text.secondary", minWidth: 0 }}
            >
              <AccessTimeOutlinedIcon sx={{ fontSize: 15 }} />
              <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
                {formatDuration(s.durationMinutes)}
              </Typography>
              {s.branches.length > 0 && (
                <>
                  <Box component="span" sx={{ color: "divider" }}>
                    ·
                  </Box>
                  <PlaceOutlinedIcon sx={{ fontSize: 15 }} />
                  <Tooltip title={`${branchNames}${s.hasHiddenBranches ? ", …" : ""}`}>
                    <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
                      {branchNames}
                      {s.hasHiddenBranches ? ", …" : ""}
                    </Typography>
                  </Tooltip>
                </>
              )}
            </Stack>

            {s.description && (
              <Tooltip title={s.description}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    mt: 0.25,
                  }}
                >
                  {s.description}
                </Typography>
              </Tooltip>
            )}
          </Stack>

          {/* Цена + статус + действия */}
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            sx={{ flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Stack alignItems="flex-end" gap={0.25}>
              <Typography variant="subtitle1" sx={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                {formatKGS(Number(s.basePrice))}
              </Typography>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: s.isActive ? "success.main" : "text.disabled",
                  }}
                />
                <Typography
                  variant="caption"
                  color={s.isActive ? "success.main" : "text.secondary"}
                >
                  {s.isActive ? "активна" : "неактивна"}
                </Typography>
              </Stack>
            </Stack>

            {canEditThis && (
              <Tooltip title="Редактировать">
                <IconButton size="small" onClick={() => handleEdit(s)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canDeleteThis && (
              <Tooltip title="Удалить">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    setConfirmRow(s);
                    setConfirmOpen(true);
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </Box>
    );
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pt: theme.appLayout.page.paddingY,
          pb: 2,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        })}
      >
        {/* Кнопка добавления + поиск + фильтры на одном уровне */}
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
          {canCreate && (
            <AppButton
              variant="contained"
              startIcon={<AddOutlinedIcon />}
              onClick={() => setAddOpen(true)}
              sx={(theme) => ({
                whiteSpace: "nowrap",
                minHeight: theme.appLayout.controls.buttonHeight,
                flexShrink: 0,
              })}
            >
              Добавить услугу
            </AppButton>
          )}

          <Paper variant="outlined" elevation={0} sx={{ p: 1.5, flex: 1, minWidth: 280 }}>
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
              <TextField
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию"
              sx={{ flex: 1, minWidth: 220 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              select
              size="small"
              label="Статус"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              sx={{ flexShrink: 0, minWidth: 150 }}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="active">Активные</MenuItem>
              <MenuItem value="inactive">Неактивные</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Филиал"
              value={branchFilter}
              onChange={(e) =>
                setBranchFilter(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              sx={{ flexShrink: 0, minWidth: 180 }}
            >
              <MenuItem value="all">Все филиалы</MenuItem>
              {branchOptions.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Сортировка"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              sx={{ flexShrink: 0, minWidth: 180 }}
            >
              <MenuItem value="name">По названию</MenuItem>
              <MenuItem value="priceAsc">Цена ↑</MenuItem>
              <MenuItem value="priceDesc">Цена ↓</MenuItem>
              <MenuItem value="duration">По длительности</MenuItem>
            </TextField>

            {hasActiveFilters && (
              <Button
                size="small"
                onClick={handleResetFilters}
                startIcon={<CloseOutlinedIcon fontSize="small" />}
                sx={{ textTransform: "none", flexShrink: 0 }}
              >
                Сбросить
              </Button>
            )}
            </Stack>
          </Paper>
        </Stack>

        <Card variant="outlined" sx={{ flex: 1, width: 1, display: "flex", flexDirection: "column" }}>
          <CardContent
            ref={scrollContainerRef}
            sx={{ p: 0, flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            {loading ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : errorMsg ? (
              <Typography color="error" sx={{ p: 2 }}>
                {errorMsg}
              </Typography>
            ) : !canView ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                Нет доступа к просмотру услуг
              </Typography>
            ) : (
              <>
                {visibleServices.length === 0 ? (
                  <Typography variant="body2" sx={{ p: 2 }}>
                    {searchQuery.trim() || statusFilter !== "all" || branchFilter !== "all"
                      ? "Ничего не найдено"
                      : "Нет услуг"}
                  </Typography>
                ) : (
                  <Stack divider={<Divider flexItem />}>
                    {visibleServices.map((s) => (
                      <ServiceListItem key={s.id} s={s} />
                    ))}
                  </Stack>
                )}
                <Stack alignItems="center" sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {visibleCount < sorted.length
                      ? "Прокрутите вниз, чтобы загрузить ещё…"
                      : "Больше услуг нет"}
                  </Typography>
                </Stack>
                <Box ref={sentinelRef} sx={{ height: 8 }} />
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Добавление */}
      <DjangoAddServiceDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          void loadAll(contextKey);
        }}
      />

      {/* Редактирование */}
      {editingRec && (
        <DjangoEditServiceDrawer
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditingRec(null);
          }}
          record={editingRec}
          onUpdated={() => {
            setEditOpen(false);
            setEditingRec(null);
            void loadAll(contextKey);
          }}
        />
      )}

      {/* Просмотр */}
      <DjangoServiceQuickViewDrawer
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedServiceId(null);
        }}
        serviceId={selectedServiceId}
      />

      {/* Подтверждение удаления */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Удалить услугу</DialogTitle>
        <DialogContent>
          <Typography>Вы уверены, что хотите удалить услугу "{confirmRow?.name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Отмена</Button>
          <Tooltip title="Удалить услугу">
            <IconButton
              color="error"
              onClick={handleDeleteConfirm}
              sx={{
                border: "1px solid",
                borderColor: "error.main",
                "&:hover": {
                  borderColor: "error.dark",
                  backgroundColor: "error.lighter",
                },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DjangoServicesPage;
