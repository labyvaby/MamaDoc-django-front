import React from "react";
import {
  Box,
  Card,
  CardContent,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { getServices, deleteService } from "../../api/catalog";
import type { Service } from "../../api/catalog";
import DjangoAddServiceDrawer from "../../components/services/DjangoAddServiceDrawer";
import DjangoEditServiceDrawer from "../../components/services/DjangoEditServiceDrawer";
import DjangoServiceQuickViewDrawer from "../../components/services/DjangoServiceQuickViewDrawer";

const BATCH_SIZE = 20;

const DjangoServicesPage: React.FC = () => {
  usePageTitle("Услуги");
  const { open: notify } = useNotification();
  const { hasPermission, activeBranch } = usePermissions();

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

  // Поиск
  const [searchQuery, setSearchQuery] = React.useState("");

  const activeBranchId = activeBranch?.id ?? null;

  const loadAll = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const svcs = await getServices(activeBranchId, signal);
      setAllServices(svcs);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  React.useEffect(() => {
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => controller.abort();
  }, [loadAll]);

  // Перезагружать при переключении контекста (org/branch)
  React.useEffect(() => {
    const handler = () => loadAll();
    window.addEventListener("mamadoc:django-context-switched", handler);
    return () => window.removeEventListener("mamadoc:django-context-switched", handler);
  }, [loadAll]);

  // Фильтрация + инфинит
  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return allServices;
    const lower = searchQuery.toLowerCase();
    return allServices.filter((s) => s.name.toLowerCase().includes(lower));
  }, [allServices, searchQuery]);

  const visibleServices = React.useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  React.useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [filtered.length, searchQuery]);

  // IntersectionObserver
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) =>
            prev >= filtered.length ? prev : Math.min(prev + BATCH_SIZE, filtered.length),
          );
        }
      },
      { root: scrollContainerRef.current, rootMargin: "200px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef, filtered.length]);

  const handleEdit = (row: Service) => {
    setEditingRec(row);
    setEditOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmRow) return;
    try {
      await deleteService(confirmRow.id);
      await loadAll();
      notify?.({ type: "success", message: "Услуга удалена" });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Не удалось удалить услугу" });
    } finally {
      setConfirmOpen(false);
      setConfirmRow(null);
    }
  };

  const ServiceListItem: React.FC<{ s: Service }> = ({ s }) => {
    const canEditThis = canUpdate && !s.hasHiddenBranches;
    const canDeleteThis = canDelete && !s.hasHiddenBranches;

    return (
      <Box
        onClick={() => {
          setSelectedServiceId(s.id);
          setDetailsOpen(true);
        }}
        sx={{
          px: 2,
          py: 2,
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          gap={1.5}
        >
          {/* Фото + название + филиалы */}
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0, flex: 1 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                overflow: "hidden",
                borderRadius: 1,
                flexShrink: 0,
                bgcolor: s.imageUrl ? "transparent" : "action.hover",
                opacity: s.isActive ? 1 : 0.6,
              }}
            >
              {s.imageUrl && (
                <Box
                  component="img"
                  src={s.imageUrl}
                  alt=""
                  sx={{ width: 1, height: 1, objectFit: "cover", display: "block" }}
                />
              )}
            </Box>
            <Stack sx={{ minWidth: 0, flex: 1 }} gap={0.5}>
              <Typography variant="subtitle1" noWrap sx={{ opacity: s.isActive ? 1 : 0.6 }}>
                {s.name || "Без названия"}
              </Typography>
              {!s.isActive && (
                <Typography variant="caption" color="error">
                  Неактивна
                </Typography>
              )}
              {s.branches.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {s.branches.map((b) => (
                    <Chip key={b.id} label={b.name} size="small" variant="outlined" />
                  ))}
                  {s.hasHiddenBranches && (
                    <Chip label="…" size="small" variant="outlined" color="default" />
                  )}
                </Stack>
              )}
            </Stack>
          </Stack>

          {/* Цена + иконки */}
          <Stack
            direction="row"
            alignItems="center"
            gap={1.25}
            sx={{ minWidth: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Typography variant="subtitle2" color="text.primary" sx={{ whiteSpace: "nowrap" }}>
              {Number(s.basePrice)} сом
            </Typography>
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
      <PageHeader
        title="Услуги"
        showTitle={false}
        addButtonText={canCreate ? "Добавить услугу" : undefined}
        onAdd={canCreate ? () => setAddOpen(true) : undefined}
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pb: 2,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        })}
      >
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
                    {searchQuery.trim() ? "Ничего не найдено" : "Нет услуг"}
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
                    {visibleCount < filtered.length
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
          loadAll();
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
            loadAll();
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
                  backgroundColor: "rgba(211, 47, 47, 0.08)",
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
