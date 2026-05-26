import React from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
  Chip,
  Drawer,
  TextField,
  Button,
  MenuItem,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getCategories,
  getServices,
  createCategory,
  updateCategory,
  createService,
  updateService,
} from "../../api/catalog";
import type { Category, Service, CategoryPayload, ServicePayload } from "../../api/catalog";

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// ── Category Form Drawer ───────────────────────────────────────────────────

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Category | null;
  categories: Category[];
  canCreate: boolean;
  canUpdate: boolean;
}

const CategoryFormDrawer: React.FC<CategoryFormProps> = ({
  open,
  onClose,
  onSaved,
  initial,
  categories,
  canCreate,
  canUpdate,
}) => {
  const { open: notify } = useNotification();
  const isEdit = !!initial;
  const allowed = isEdit ? canUpdate : canCreate;

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [parentId, setParentId] = React.useState<string>("");
  const [isActive, setIsActive] = React.useState(true);
  const [sortOrder, setSortOrder] = React.useState("0");
  const [saving, setSaving] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSlug(initial?.slug ?? "");
      setDescription(initial?.description ?? "");
      setParentId(initial?.parentId != null ? String(initial.parentId) : "");
      setIsActive(initial?.isActive ?? true);
      setSortOrder(String(initial?.sortOrder ?? 0));
      setSlugTouched(false);
    }
  }, [open, initial]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) {
      notify?.({ type: "error", message: "Название и slug обязательны" });
      return;
    }
    setSaving(true);
    try {
      const payload: CategoryPayload = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        parentId: parentId ? Number(parentId) : null,
        isActive,
        sortOrder: Number(sortOrder) || 0,
      };
      if (isEdit && initial) {
        await updateCategory(initial.id, payload);
      } else {
        await createCategory(payload);
      }
      notify?.({ type: "success", message: isEdit ? "Категория обновлена" : "Категория создана" });
      onSaved();
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setSaving(false);
    }
  };

  const parentOptions = categories.filter((c) => !initial || c.id !== initial.id);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 420 } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? "Редактировать категорию" : "Новая категория"}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
          {!allowed ? (
            <Typography color="text.secondary">Недостаточно прав</Typography>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="Название"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                fullWidth
                size="small"
                required
              />
              <TextField
                label="Slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                fullWidth
                size="small"
                required
                helperText="Латинские буквы, цифры, дефисы"
              />
              <TextField
                label="Описание"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={3}
              />
              <TextField
                label="Родительская категория"
                select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="">— Без родителя —</MenuItem>
                {parentOptions.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Порядок сортировки"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ min: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                label="Активна"
              />
            </Stack>
          )}
        </Box>

        {/* Footer */}
        {allowed && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 2.5, py: 2, borderTop: 1, borderColor: "divider" }}>
            <Button variant="outlined" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={18} /> : "Сохранить"}
            </Button>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

// ── Service Form Drawer ────────────────────────────────────────────────────

interface ServiceFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Service | null;
  categories: Category[];
  canCreate: boolean;
  canUpdate: boolean;
}

const ServiceFormDrawer: React.FC<ServiceFormProps> = ({
  open,
  onClose,
  onSaved,
  initial,
  categories,
  canCreate,
  canUpdate,
}) => {
  const { open: notify } = useNotification();
  const isEdit = !!initial;
  const allowed = isEdit ? canUpdate : canCreate;

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [durationMinutes, setDurationMinutes] = React.useState("30");
  const [basePrice, setBasePrice] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [requiresDoctor, setRequiresDoctor] = React.useState(false);
  const [sortOrder, setSortOrder] = React.useState("0");
  const [saving, setSaving] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSlug(initial?.slug ?? "");
      setDescription(initial?.description ?? "");
      setCategoryId(initial?.category?.id != null ? String(initial.category.id) : "");
      setDurationMinutes(String(initial?.durationMinutes ?? 30));
      setBasePrice(initial?.basePrice ?? "");
      setIsActive(initial?.isActive ?? true);
      setRequiresDoctor(initial?.requiresDoctor ?? false);
      setSortOrder(String(initial?.sortOrder ?? 0));
      setSlugTouched(false);
    }
  }, [open, initial]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSave = async () => {
    const dur = Number(durationMinutes);
    if (!name.trim() || !slug.trim()) {
      notify?.({ type: "error", message: "Название и slug обязательны" });
      return;
    }
    if (!basePrice.trim()) {
      notify?.({ type: "error", message: "Укажите базовую цену" });
      return;
    }
    if (!dur || dur <= 0) {
      notify?.({ type: "error", message: "Длительность должна быть положительным числом" });
      return;
    }
    setSaving(true);
    try {
      const payload: ServicePayload = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        categoryId: categoryId ? Number(categoryId) : null,
        durationMinutes: dur,
        basePrice: basePrice.trim(),
        isActive,
        requiresDoctor,
        sortOrder: Number(sortOrder) || 0,
      };
      if (isEdit && initial) {
        await updateService(initial.id, payload);
      } else {
        await createService(payload);
      }
      notify?.({ type: "success", message: isEdit ? "Услуга обновлена" : "Услуга создана" });
      onSaved();
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? "Редактировать услугу" : "Новая услуга"}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
          {!allowed ? (
            <Typography color="text.secondary">Недостаточно прав</Typography>
          ) : (
            <Stack spacing={2}>
              <TextField
                label="Название"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                fullWidth
                size="small"
                required
              />
              <TextField
                label="Slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                fullWidth
                size="small"
                required
                helperText="Латинские буквы, цифры, дефисы"
              />
              <TextField
                label="Категория"
                select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="">— Без категории —</MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Описание"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={3}
              />
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Длительность (мин)"
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  size="small"
                  inputProps={{ min: 1 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Базовая цена"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  size="small"
                  placeholder="0.00"
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label="Порядок сортировки"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ min: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                label="Активна"
              />
              <FormControlLabel
                control={<Switch checked={requiresDoctor} onChange={(e) => setRequiresDoctor(e.target.checked)} />}
                label="Требуется врач"
              />
            </Stack>
          )}
        </Box>

        {/* Footer */}
        {allowed && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 2.5, py: 2, borderTop: 1, borderColor: "divider" }}>
            <Button variant="outlined" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={18} /> : "Сохранить"}
            </Button>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

// ── Services Tab ───────────────────────────────────────────────────────────

interface ServicesTabProps {
  services: Service[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  onRefresh: () => void;
}

const ServicesTab: React.FC<ServicesTabProps> = ({
  services,
  categories,
  loading,
  error,
  canCreate,
  canUpdate,
  onRefresh,
}) => {
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Service | null>(null);

  const filtered = React.useMemo(() => {
    let list = services;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    if (categoryFilter) {
      list = list.filter((s) => String(s.category?.id ?? "") === categoryFilter);
    }
    return list;
  }, [services, search, categoryFilter]);

  const handleEdit = (s: Service) => {
    setEditing(s);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditing(null);
    onRefresh();
  };

  return (
    <>
      <PageHeader
        title="Услуги"
        showTitle={false}
        addButtonText={canCreate ? "Добавить услугу" : undefined}
        onAdd={canCreate ? handleAdd : undefined}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        loading={loading}
        actions={
          <TextField
            select
            size="small"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            sx={{ minWidth: 160 }}
            label="Категория"
          >
            <MenuItem value="">Все категории</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
            ))}
          </TextField>
        }
      />

      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pb: 2, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
        <Card variant="outlined" sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <CardContent sx={{ p: 0, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {loading ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : error ? (
              <Typography color="error" sx={{ p: 2 }}>{error}</Typography>
            ) : filtered.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                <Typography variant="body2" color="text.secondary">
                  {services.length === 0 ? "Услуги не найдены" : "Нет услуг, соответствующих фильтру"}
                </Typography>
              </Stack>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {filtered.map((s) => (
                  <ServiceRow
                    key={s.id}
                    service={s}
                    canUpdate={canUpdate}
                    onEdit={() => handleEdit(s)}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      <ServiceFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
        initial={editing}
        categories={categories}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />
    </>
  );
};

interface ServiceRowProps {
  service: Service;
  canUpdate: boolean;
  onEdit: () => void;
}

const ServiceRow: React.FC<ServiceRowProps> = ({ service: s, canUpdate, onEdit }) => (
  <Box sx={{ px: 2, py: 1.5, "&:hover": { bgcolor: "action.hover" } }}>
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" gap={1}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0, flex: 1 }}>
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2" noWrap sx={{ opacity: s.isActive ? 1 : 0.55 }}>
              {s.name}
            </Typography>
            {!s.isActive && (
              <Chip label="Неактивна" size="small" color="default" sx={{ height: 18, fontSize: "0.65rem" }} />
            )}
            {s.requiresDoctor && (
              <Tooltip title="Требуется врач">
                <LocalHospitalOutlinedIcon sx={{ fontSize: 16, color: "primary.main" }} />
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 0.25 }}>
            {s.category && (
              <Typography variant="caption" color="text.secondary">{s.category.name}</Typography>
            )}
            <Typography variant="caption" color="text.secondary">{s.durationMinutes} мин</Typography>
          </Stack>
        </Stack>
      </Stack>

      <Stack direction="row" alignItems="center" gap={1.5}>
        <Typography variant="subtitle2" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {Number(s.basePrice).toLocaleString("ru-KG")} сом
        </Typography>
        <Tooltip title={s.isActive ? "Активна" : "Неактивна"}>
          {s.isActive
            ? <CheckCircleOutlineIcon sx={{ fontSize: 18, color: "success.main" }} />
            : <CancelOutlinedIcon sx={{ fontSize: 18, color: "text.disabled" }} />}
        </Tooltip>
        {canUpdate && (
          <Tooltip title="Редактировать">
            <IconButton size="small" onClick={onEdit}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  </Box>
);

// ── Categories Tab ─────────────────────────────────────────────────────────

interface CategoriesTabProps {
  categories: Category[];
  loading: boolean;
  error: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  onRefresh: () => void;
}

const CategoriesTab: React.FC<CategoriesTabProps> = ({
  categories,
  loading,
  error,
  canCreate,
  canUpdate,
  onRefresh,
}) => {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (c: Category) => { setEditing(c); setFormOpen(true); };
  const handleSaved = () => { setFormOpen(false); setEditing(null); onRefresh(); };

  return (
    <>
      <PageHeader
        title="Категории"
        showTitle={false}
        addButtonText={canCreate ? "Добавить категорию" : undefined}
        onAdd={canCreate ? handleAdd : undefined}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        loading={loading}
      />

      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pb: 2, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
        <Card variant="outlined" sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <CardContent sx={{ p: 0, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {loading ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : error ? (
              <Typography color="error" sx={{ p: 2 }}>{error}</Typography>
            ) : filtered.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                <Typography variant="body2" color="text.secondary">
                  {categories.length === 0 ? "Категории не найдены" : "Нет категорий, соответствующих фильтру"}
                </Typography>
              </Stack>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {filtered.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    categories={categories}
                    canUpdate={canUpdate}
                    onEdit={() => handleEdit(c)}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      <CategoryFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
        initial={editing}
        categories={categories}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />
    </>
  );
};

interface CategoryRowProps {
  category: Category;
  categories: Category[];
  canUpdate: boolean;
  onEdit: () => void;
}

const CategoryRow: React.FC<CategoryRowProps> = ({ category: c, categories, canUpdate, onEdit }) => {
  const parent = c.parentId != null ? categories.find((x) => x.id === c.parentId) : null;
  return (
    <Box sx={{ px: 2, py: 1.5, "&:hover": { bgcolor: "action.hover" } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="subtitle2" noWrap sx={{ opacity: c.isActive ? 1 : 0.55 }}>
              {c.name}
            </Typography>
            {!c.isActive && (
              <Chip label="Неактивна" size="small" color="default" sx={{ height: 18, fontSize: "0.65rem" }} />
            )}
          </Stack>
          {parent && (
            <Typography variant="caption" color="text.secondary">Родитель: {parent.name}</Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="center" gap={1}>
          {canUpdate && (
            <Tooltip title="Редактировать">
              <IconButton size="small" onClick={onEdit}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────

const DjangoServicesPage: React.FC = () => {
  usePageTitle("Услуги");

  const { hasPermission, isSuperAdmin, loading: permLoading } = usePermissions();

  const canView = isSuperAdmin() || hasPermission("catalog.view");
  const canCreate = isSuperAdmin() || hasPermission("catalog.create");
  const canUpdate = isSuperAdmin() || hasPermission("catalog.update");

  const [tab, setTab] = React.useState(0);
  const [services, setServices] = React.useState<Service[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [cats, svcs] = await Promise.all([getCategories(), getServices()]);
      setCategories(cats);
      setServices(svcs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки данных");
    } finally {
      setLoadingData(false);
    }
  }, []);

  React.useEffect(() => {
    if (!permLoading && canView) {
      load();
    }
  }, [permLoading, canView, load]);

  if (permLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canView) {
    return <AccessDenied />;
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Tab switcher */}
      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pt: 1, pb: 0 })}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40 }}>
          <Tab label="Услуги" sx={{ minHeight: 40, py: 0.5 }} />
          <Tab label="Категории" sx={{ minHeight: 40, py: 0.5 }} />
        </Tabs>
        <Divider />
      </Box>

      {/* Tab panels */}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", pt: 1.5 }}>
        {tab === 0 && (
          <ServicesTab
            services={services}
            categories={categories}
            loading={loadingData}
            error={error}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onRefresh={load}
          />
        )}
        {tab === 1 && (
          <CategoriesTab
            categories={categories}
            loading={loadingData}
            error={error}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onRefresh={load}
          />
        )}
      </Box>
    </Box>
  );
};

export default DjangoServicesPage;
