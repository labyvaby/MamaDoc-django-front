import React from "react";
import {
  Box,
  Card,
  CardContent,
  Button,
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
import { supabase } from "../../utility/supabaseClient";
import AddServiceDrawer from "../../components/services/AddServiceDrawer";
import EditServiceDrawer from "../../components/services/EditServiceDrawer";
import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import ServiceQuickViewDrawer from "../../components/services/ServiceQuickViewDrawer";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import DjangoServicesPage from "./DjangoServicesPage";

// ── Router ─────────────────────────────────────────────────────────────────

const ServicesPage: React.FC = () => {
  if (IS_DJANGO_BACKEND) return <DjangoServicesPage />;
  return <SupabaseServicesPage />;
};

export default ServicesPage;

// ── Supabase implementation (original, unchanged) ──────────────────────────

const importMetaEnv =
  ((import.meta as unknown) as { env?: Record<string, string | undefined> })
    .env || {};

// Источник услуг по умолчанию — таблица Services
const SERVICES_TABLE: string = "Services";
// Таблица записи изменений/вставок (для редактирования/удаления)
const SERVICES_WRITE: string = importMetaEnv.VITE_SERVICES_WRITE_TABLE || "Services";

// Нормализация сервисных полей из произвольной схемы
function mapServiceId(r: Record<string, unknown>): string {
  const cand =
    r["sellable_item_id"] ??
    r["Услуга ID"] ??
    r["Service ID"] ??
    r["service_id"] ??
    r["serviceId"] ??
    r["ID"] ??
    r["id"];
  return String(cand ?? "");
}

function mapServiceName(r: Record<string, unknown>): string {
  return String(
    r["name"] ??
    r["Название услуги"] ??
    r["Название"] ??
    r["Наименование"] ??
    r["title"] ??
    r["service_name"] ??
    ""
  );
}

function mapServicePrice(r: Record<string, unknown>): number {
  const v = (r["price_som"] ?? r["price"] ?? r["Стоимость, сом"] ?? r["Стоимость"] ?? r["Итого, сом"] ?? r["amount"] ?? r["cost"]) as
    | number
    | string
    | null
    | undefined;
  return Number(v ?? 0);
}

function mapServicePhoto(r: Record<string, unknown>): string | null {
  return (r["image_url"] as string | null) ?? (r["photo_url"] as string | null) ?? (r["Картинка"] as string | null) ?? null;
}

function mapEmployeeName(r: Record<string, unknown>): string | null {
  return (
    (r["employee_name"] as string | null) ??
    (r["Доктор ФИО"] as string | null) ??
    (r["Сотрудник ФИО"] as string | null) ??
    null
  );
}

// Тип агрегированной услуги
type AggregatedService = {
  id: string;
  name: string;
  price: number;
  photo_url: string | null;
  employees: string[]; // список сотрудников для этой услуги
  editable: boolean;
  description: string | null;
  is_active: boolean;
};

// Агрегация: объединяем строки по ID услуги, собираем сотрудников
function aggregateServices(rows: Array<Record<string, unknown>>): AggregatedService[] {
  const map = new Map<string, AggregatedService>();
  for (const r of rows) {
    const id = mapServiceId(r);
    // Skip if no ID or if ID is "undefined" or empty
    if (!id || id === "undefined") continue;

    const name = mapServiceName(r);
    const price = mapServicePrice(r);
    const photo = mapServicePhoto(r);
    const emp = mapEmployeeName(r);

    const existing = map.get(id);
    if (!existing) {
      map.set(id, {
        id,
        name,
        price,
        photo_url: photo,
        employees: emp ? [emp] : [],
        editable: false,
        description: (r["description"] as string | null) ?? null,
        is_active: (r["is_active"] as boolean) ?? true,
      });
    } else {
      if (!existing.name && name) existing.name = name;
      if (!existing.price && price) existing.price = price;
      if (!existing.photo_url && photo) existing.photo_url = photo;
      if (emp && !existing.employees.includes(emp)) existing.employees.push(emp);
    }
  }
  // Сортируем по названию для стабильного UI
  return Array.from(map.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "ru", { sensitivity: "base" }));
}

const SupabaseServicesPage: React.FC = () => {
  usePageTitle("Услуги");
  const { open: notify } = useNotification();
  const { isAdmin: isAdminFunc } = usePermissions();
  const isAdmin = isAdminFunc();
  // Инфинит-скролл по уникальным услугам (после агрегации)
  const BATCH_SIZE = 20;
  const [visibleCount, setVisibleCount] = React.useState(BATCH_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // Данные
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [allServices, setAllServices] = React.useState<AggregatedService[]>([]);
  const [totalUnique, setTotalUnique] = React.useState(0);

  // Drawers
  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selectedServiceId, setSelectedServiceId] = React.useState<string | null>(null);

  // Запись для редактирования
  const [editingRec, setEditingRec] = React.useState<{
    id: string | number;
    name: string;
    price: number;
    employee_id: string | null;
    employee_name?: string | null;
    photo_url?: string | null;
    description?: string | null;
    is_active?: boolean;
  } | null>(null);

  // Подтверждение удаления
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmRow, setConfirmRow] = React.useState<AggregatedService | null>(null);

  // Загрузка данных: сначала берем основной список из таблицы записи,
  // чтобы гарантированно видеть новые услуги, затем обогащаем их.
  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Получаем основной список из таблицы записи (Services)
      const { data: writeData, error: writeError } = await supabase
        .schema("public")
        .from(SERVICES_WRITE)
        .select("*");

      if (writeError) throw writeError;
      const baseServices = (writeData ?? []) as Array<Record<string, unknown>>;

      // 2. Получаем данные из основной таблицы/вьюхи (Services) для получения доп. инфо (например, врачей)
      const { data: viewData } = await supabase
        .schema("public")
        .from(SERVICES_TABLE)
        .select("*");

      const viewRows = (viewData ?? []) as Array<Record<string, unknown>>;

      // Объединяем данные. Базовый список — это то, что мы точно должны видеть.
      // Добавляем к нему строки из вьюхи, если они есть.
      const allRows = [...baseServices];
      // Если во вьюхе есть данные, которых нет в базовой таблице (маловероятно, но для совместимости),
      // или если вьюха дает дубликаты с врачами — aggregateServices это обработает.
      if (viewRows.length > 0) {
        // Добавляем только те строки из вьюхи, которые расширяют информацию
        allRows.push(...viewRows);
      }

      // 3. Получаем цены
      // Усиленная фильтрация itemIds: исключаем null, undefined, пустые строки и строковое "null"/"undefined"
      const itemIds = Array.from(new Set(
        allRows.map(r => mapServiceId(r)).filter(id =>
          id &&
          id !== "null" &&
          id !== "undefined" &&
          id.trim() !== ""
        )
      ));

      // 3. Загружаем статусы активности из SellableItems
      const activeStatusMap = new Map<string, boolean>();
      if (itemIds.length > 0) {
        const { data: sData } = await supabase
          .from("SellableItems")
          .select("id, is_active")
          .in("id", itemIds);

        if (sData) {
          sData.forEach(s => activeStatusMap.set(String(s.id), s.is_active));
        }
      }

      const pricesMap = new Map<string, number>();
      if (itemIds.length > 0) {
        try {
          const { data: pdata } = await supabase
            .schema("public")
            .from("Prices")
            .select("sellable_item_id, price")
            .eq("is_current", true)
            .in("sellable_item_id", itemIds);

          if (Array.isArray(pdata)) {
            for (const p of pdata) {
              if (p.sellable_item_id) pricesMap.set(p.sellable_item_id, Number(p.price));
            }
          }
        } catch (err) {
          console.error("Error fetching prices:", err);
        }
      }

      // 4. Слияние и агрегация
      const readyRows = allRows.map(r => {
        const sid = mapServiceId(r);
        r.is_active = activeStatusMap.get(sid) ?? true;
        // Если в строке уже есть price_som (из таблицы Services), используем его.
        // Иначе ищем в карте цен (Prices).
        if (!r["price"] && r["price_som"]) {
          r["price"] = r["price_som"];
        }
        if (!r["price"] && sid && pricesMap.has(sid)) {
          r["price"] = pricesMap.get(sid);
        }
        return r;
      });


      const aggregated = aggregateServices(readyRows);

      // Определяем редактируемость
      // Используем Set для быстрого поиска. Сравниваем как строки.
      const editableIds = new Set(baseServices.map(s => String(mapServiceId(s))).filter(id => id && id !== "undefined"));

      for (const s of aggregated) {
        // Услуга редактируема, если она есть в основной таблице Services (baseServices)
        s.editable = editableIds.has(String(s.id));
      }

      setAllServices(aggregated);
      setTotalUnique(aggregated.length);
    } catch (e) {
      console.error("Load services failed:", e);
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // REALTIME: Подписка на изменения услуг, цен и признаков активности
  React.useEffect(() => {
    const channel = supabase
      .channel("services-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: SERVICES_WRITE },
        () => {
          console.log("Realtime: Services changed, reloading...");
          loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "SellableItems" },
        () => {
          console.log("Realtime: SellableItems changed, reloading...");
          loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Prices" },
        () => {
          console.log("Realtime: Prices changed, reloading...");
          loadAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  // Поиск
  const [searchQuery, setSearchQuery] = React.useState("");

  // Видимые элементы для бесконечной прокрутки (клиентская нарезка + фильтрация)
  const visibleServices = React.useMemo(() => {
    let filtered = allServices;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = allServices.filter(s => s.name.toLowerCase().includes(lower));
    }
    return filtered.slice(0, visibleCount);
  }, [allServices, visibleCount, searchQuery]);

  // Сброс видимого количества при изменении общего списка или поиска
  React.useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [totalUnique, searchQuery]);

  // Scroll container ref
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  // IntersectionObserver для подгрузки следующих батчей
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    // Ensure we have the root if possible, otherwise default to viewport (which might be flaky here)
    // But since we are creating the observer in an effect, scrollContainerRef.current should be available
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setVisibleCount((prev) => {
            if (prev >= allServices.length) return prev;
            return Math.min(prev + BATCH_SIZE, allServices.length);
          });
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px", // Preload earlier
        threshold: 0.1
      }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef, allServices.length]);

  // Действия
  const handleEdit = (row: AggregatedService) => {
    if (!row.editable) {
      notify?.({ type: "error", message: "Эту запись нельзя редактировать (нет ID в таблице изменений Services)." });
      return;
    }
    setEditingRec({
      id: row.id, // предполагаем совпадение с ID в write-таблице (Services)
      name: row.name,
      price: Number(row.price || 0),
      employee_id: null,
      employee_name: row.employees[0] || null,
      photo_url: row.photo_url ?? null,
      description: row.description,
      is_active: row.is_active,
    });
    setEditOpen(true);
  };

  const handleDelete = async (row: AggregatedService) => {
    if (!row.editable) {
      notify?.({ type: "error", message: "Эту запись нельзя удалить (нет ID в таблице изменений Services)." });
      return;
    }
    try {
      // Пробуем удалить по "sellable_item_id", затем по "ID"/"id"
      let delOk = false;
      const tryDelete = async (col: string) => {
        const { error } = await supabase.schema("public").from(SERVICES_WRITE).delete().eq(col, row.id);
        if (error) throw error;
        return true;
      };

      try {
        await tryDelete("sellable_item_id");
        delOk = true;
      } catch {
        try {
          await tryDelete("ID");
          delOk = true;
        } catch {
          try {
            await tryDelete("id");
            delOk = true;
          } catch {
            // fail
          }
        }
      }

      if (!delOk) throw new Error("Не удалось удалить услугу");

      // Перезагружаем
      await loadAll();
      notify?.({ type: "success", message: "Услуга удалена" });
    } catch (e) {
      console.error("Delete service failed:", e);
      notify?.({ type: "error", message: "Не удалось удалить услугу. Проверьте права RLS." });
    }
  };

  // Компонент элемента услуги
  const ServiceItem: React.FC<{ s: AggregatedService }> = ({ s }) => {
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
          "&:hover": { bgcolor: (theme) => theme.palette.action.hover },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0, flex: 1 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                overflow: "hidden",
                borderRadius: 1,
                flexShrink: 0,
                bgcolor: s.photo_url ? "transparent" : "action.hover",
              }}
            >
              {s.photo_url ? (
                <Box
                  component="img"
                  src={s.photo_url}
                  alt=""
                  sx={{ width: 1, height: 1, objectFit: "cover", display: "block" }}
                />
              ) : null}
            </Box>

            <Stack sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" noWrap sx={{ opacity: s.is_active ? 1 : 0.6 }}>
                {s.name || "Без названия"}
              </Typography>
              {!s.is_active && (
                <Typography variant="caption" color="error">
                  Неактивна
                </Typography>
              )}
            </Stack>
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            gap={1.25}
            sx={{ minWidth: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Typography variant="subtitle2" color="text.primary" sx={{ whiteSpace: "nowrap" }}>
              {Number.isFinite(Number(s.price)) ? String(s.price ?? 0) : "0"} сом
            </Typography>
            {isAdmin && (
              <Tooltip title={s.editable ? "Редактировать" : "Нельзя редактировать"}>
                <span>
                  <IconButton size="small" onClick={() => handleEdit(s)} disabled={!s.editable}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {isAdmin && (
              <Tooltip title={s.editable ? "Удалить" : "Нельзя удалить"}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      setConfirmRow(s);
                      setConfirmOpen(true);
                    }}
                    disabled={!s.editable}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <PageHeader
        title="Услуги"
        showTitle={false}
        addButtonText={isAdmin ? "Добавить услугу" : undefined}
        onAdd={isAdmin ? () => setAddOpen(true) : undefined}
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pb: 2, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
        <Card
          variant="outlined"
          sx={{ flex: 1, width: 1, display: "flex", flexDirection: "column" }}
        >
          {/* Removed CardHeader as actions are now in PageHeader */}
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
            ) : (
              <>
                {visibleServices.length === 0 ? (
                  <Typography variant="body2" sx={{ p: 2 }}>
                    Нет услуг
                  </Typography>
                ) : (
                  <Stack divider={<Divider flexItem />}>
                    {visibleServices.map((s) => (
                      <ServiceItem key={s.id} s={s} />
                    ))}
                  </Stack>
                )}
                <Stack alignItems="center" sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {visibleCount < totalUnique ? "Прокрутите вниз, чтобы загрузить ещё…" : "Больше услуг нет"}
                  </Typography>
                </Stack>
                <Box ref={sentinelRef} sx={{ height: 8 }} />
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Добавление услуги */}
      <AddServiceDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={async () => {
          setAddOpen(false);
          await loadAll();
        }}
      />

      {/* Редактирование услуги */}
      {editingRec && (
        <EditServiceDrawer
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditingRec(null);
          }}
          record={editingRec}
          onUpdated={async () => {
            setEditOpen(false);
            setEditingRec(null);
            await loadAll();
          }}
        />
      )}

      {/* Просмотр услуги */}
      <ServiceQuickViewDrawer
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
              onClick={async () => {
                if (confirmRow) {
                  await handleDelete(confirmRow);
                  setConfirmOpen(false);
                  setConfirmRow(null);
                } else {
                  setConfirmOpen(false);
                }
              }}
              sx={{
                border: '1px solid',
                borderColor: 'error.main',
                '&:hover': {
                  borderColor: 'error.dark',
                  backgroundColor: 'rgba(211, 47, 47, 0.08)',
                }
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
