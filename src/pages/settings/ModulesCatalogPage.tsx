import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ClearOutlined from "@mui/icons-material/ClearOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import {
  type CatalogModule,
  createModuleRequest,
  setOrganizationModule,
  setPackageModule,
  setStorefrontProductState,
} from "../../api/tenancy";
import { useCan } from "../../hooks/useCan";
import { useInactiveProducts } from "../../hooks/useInactiveProducts";
import { useModulesCatalog } from "../../hooks/useModulesCatalog";
import { useModuleRequests } from "../../hooks/useModuleRequests";
import { useStorefrontFeatures } from "../../hooks/useStorefrontFeatures";
import { refreshAuthContext, usePermissions } from "../../hooks/usePermissions";
import { MODULE_SETTINGS_ROUTE } from "../../config/moduleCatalogMeta";
import { catalogActions } from "../../config/moduleCatalogActions";
import { RECOMMEND_TITLE } from "../../config/moduleStorefront";
import {
  buildStorefront,
  bundleTarget,
  disconnectTarget,
  itemTarget,
  searchStorefront,
  storefrontVertical,
  type IncludedItem,
  type RequestTarget,
  type StorefrontItem,
} from "../../config/moduleStorefrontModel";
import { SettingsLayout } from "./SettingsLayout";
import { BundleCard } from "./modules/BundleCard";
import { IncludedCard } from "./modules/IncludedCard";
import { ProductCard } from "./modules/ProductCard";
import { ProductDrawer } from "./modules/ProductDrawer";
import { RequestDialog, type RequestContact } from "./modules/RequestDialog";

/**
 * Подтверждаемое переключение. Организация фиксируется в момент нажатия.
 * selfService — клиника сама включает модуль своего пакета; иначе — оператор платформы.
 */
type PendingToggle = {
  module: CatalogModule;
  enable: boolean;
  organizationId: number;
  organizationName: string;
  selfService: boolean;
};
/** Заявка клиники — тоже с организацией на момент нажатия. */
type PendingRequest = RequestTarget & { organizationId: number };
/** Скрыть товар от всех клиник или показать снова — решение оператора платформы. */
type PendingVisibility = { productId: string; title: string; inactive: boolean };
type Notice = { severity: "success" | "error"; text: string };

const GRID = { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" };

/** Подпись кнопки перехода: экран настроек — «Настроить», рабочий раздел — «Открыть». */
const routeLabel = (route: string) => (route.startsWith("/settings") ? "Настроить" : "Открыть");

/**
 * Витрина «Модули» (docs/specs/2026-09-26-modules-storefront-design.md): товары
 * с ценами, подборки «Рекомендуем», «Подробнее», заявка менеджеру, поиск и раздел
 * «Входит в ваш пакет». Суперпользователь платформы вместо заявки переключает
 * модули сам.
 */
const ModulesCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalogQuery = useModulesCatalog();
  const requestsQuery = useModuleRequests();
  const featuresQuery = useStorefrontFeatures();
  const inactiveQuery = useInactiveProducts();
  const {
    isPlatformAdmin,
    activeOrganization,
    activeEmployee,
    organizationModules,
    viewAsOrganization,
    setViewAsOrganization,
  } = usePermissions();
  // Любые модули переключает суперпользователь платформы. Клиника с правом
  // сама включает и выключает модули своего пакета, платные — заявкой.
  const isOperator = Boolean(isPlatformAdmin && activeOrganization);
  const canConnect = useCan("tenancy.catalog.connect");
  const canDisconnect = useCan("tenancy.catalog.disconnect");
  const orgName = activeOrganization?.name ?? "организации";
  const vertical = storefrontVertical(activeOrganization?.vertical);

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<PendingRequest | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [visibility, setVisibility] = useState<PendingVisibility | null>(null);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilityReason, setVisibilityReason] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const catalogByCode = useMemo(() => new Map(catalog.map((m) => [m.code, m])), [catalog]);
  const inactive = useMemo(
    () => new Map((inactiveQuery.data ?? []).map((state) => [state.productId, state.reason])),
    [inactiveQuery.data],
  );
  const storefront = useMemo(
    () =>
      buildStorefront({
        catalog,
        vertical,
        openRequests: requestsQuery.data ?? [],
        // Признаки не пришли — товары без модуля не показываем, а не предлагаем вслепую.
        signals: featuresQuery.data ?? null,
        operator: isOperator,
        inactive,
      }),
    [catalog, vertical, requestsQuery.data, featuresQuery.data, isOperator, inactive],
  );
  const searching = search.trim().length > 0;
  const found = useMemo(() => searchStorefront(storefront, search), [storefront, search]);
  // Поиск идёт по всей витрине, фильтр-чипы — только без поиска.
  const shelf = searching
    ? found.items
    : found.items.filter(({ item }) =>
        filter === "all" ? true : filter === "connected" ? item.status === "connected" : item.product.category === filter,
      );
  // Неактивное (его видит только оператор) — отдельным блоком, а не хвостом полки.
  const onShelf = shelf.filter(({ item }) => !item.inactive);
  const hiddenShelf = shelf.filter(({ item }) => item.inactive);
  const hiddenCount = storefront.items.filter((i) => i.inactive).length;
  const drawerItem = storefront.items.find((i) => i.product.id === drawerId) ?? null;

  // Организация сменилась при открытом окне — подтверждение относилось к прежней.
  useEffect(() => {
    const orgId = activeOrganization?.id;
    if (pending && pending.organizationId !== orgId) setToggleOpen(false);
    if (requestTarget && requestTarget.organizationId !== orgId) setRequestOpen(false);
  }, [activeOrganization?.id, pending, requestTarget]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tenancy.all });
  };

  const toggle = useMutation({
    mutationFn: (p: PendingToggle) =>
      p.selfService
        ? setPackageModule(p.organizationId, p.module.code, p.enable)
        : setOrganizationModule(p.organizationId, p.module.code, p.enable),
    onSuccess: (row) =>
      setNotice({ severity: "success", text: `«${row.moduleName}» ${row.isEnabled ? "подключён" : "отключён"}.` }),
    onError: (error) =>
      setNotice({
        severity: "error",
        text: error instanceof Error ? error.message : "Не удалось переключить модуль.",
      }),
    onSettled: () => {
      // И после ошибки: отказ мог прийти из-за устаревшего экрана.
      refresh();
      // organizationModules в /auth/me/ поменялись — «Меню как у клиники» сменится сразу.
      void refreshAuthContext();
      setToggleOpen(false);
    },
  });

  const sendRequest = useMutation({
    mutationFn: ({ target, contact }: { target: PendingRequest; contact: RequestContact }) =>
      createModuleRequest(target.organizationId, {
        productId: target.productId,
        productTitle: target.title,
        moduleCodes: target.modules,
        contactName: contact.name,
        contactPhone: contact.phone,
        comment: contact.comment,
        kind: target.kind === "disconnect" ? "disconnect" : "connect",
      }),
    onSuccess: (_, { target }) => {
      const texts: Partial<Record<RequestTarget["kind"], string>> = {
        soon: "Заявка отправлена. Расскажем о запуске.",
        disconnect: "Заявка на отключение отправлена. Менеджер свяжется с вами.",
      };
      setNotice({
        severity: "success",
        text: texts[target.kind] ?? "Заявка отправлена. Менеджер свяжется с вами.",
      });
      setRequestOpen(false);
    },
    onError: (error) =>
      setNotice({
        severity: "error",
        text: error instanceof Error ? error.message : "Не удалось отправить заявку.",
      }),
    onSettled: refresh,
  });

  const changeVisibility = useMutation({
    mutationFn: (p: PendingVisibility & { reason: string }) =>
      setStorefrontProductState(p.productId, p.inactive, p.reason),
    onSuccess: (state, p) =>
      setNotice({
        severity: "success",
        text: state.isInactive ? `«${p.title}» скрыт от клиник.` : `«${p.title}» снова виден клиникам.`,
      }),
    onError: (error) =>
      setNotice({
        severity: "error",
        text: error instanceof Error ? error.message : "Не удалось изменить статус.",
      }),
    onSettled: () => {
      refresh();
      setVisibilityOpen(false);
    },
  });

  const askVisibility = (item: StorefrontItem, makeInactive: boolean) => {
    setVisibility({ productId: item.product.id, title: item.product.title, inactive: makeInactive });
    setVisibilityReason("");
    setVisibilityOpen(true);
  };

  const askToggle = (module: CatalogModule, enable: boolean, selfService = false) => {
    if (!activeOrganization) return;
    setPending({
      module,
      enable,
      organizationId: activeOrganization.id,
      organizationName: activeOrganization.name,
      selfService,
    });
    setToggleOpen(true);
  };
  const askRequest = (target: RequestTarget) => {
    if (!activeOrganization) return;
    setRequestTarget({ ...target, organizationId: activeOrganization.id });
    setRequestOpen(true);
  };
  const routeOf = (item: StorefrontItem) =>
    item.product.route ?? item.product.modules.map((code) => MODULE_SETTINGS_ROUTE[code]).find(Boolean);
  const routeButton = (item: StorefrontItem, props: React.ComponentProps<typeof Button> = { size: "small" }) => {
    const route = routeOf(item);
    return route ? (
      <Button {...props} onClick={() => navigate(route)}>
        {routeLabel(route)}
      </Button>
    ) : null;
  };

  /** Отключить платный товар можно только заявкой: оплату останавливает менеджер. */
  const canAskOff = (item: StorefrontItem) =>
    canDisconnect && item.status === "connected" && item.product.modules.length > 0 && !item.pendingDisconnect;

  const clinicAction = (item: StorefrontItem): React.ReactNode => {
    if (item.status === "available") {
      return canConnect ? (
        <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => askRequest(itemTarget(item))}>
          {item.product.price === null ? "Узнать" : "Подключить"}
        </Button>
      ) : null;
    }
    if (item.status === "soon") {
      return canConnect ? (
        <Button size="small" variant="outlined" onClick={() => askRequest(itemTarget(item))}>
          Узнать о запуске
        </Button>
      ) : null;
    }
    if (item.status !== "connected") return null;
    const route = routeButton(item);
    const off = canAskOff(item) ? (
      <Button size="small" color="error" onClick={() => askRequest(disconnectTarget(item))}>
        Отключить
      </Button>
    ) : null;
    return route || off ? (
      <Stack direction="row" spacing={0.5}>
        {route}
        {off}
      </Stack>
    ) : null;
  };

  const operatorAction = (item: StorefrontItem): React.ReactNode => {
    // У скрытого главное — вернуть клиникам; модули переключаются в «Подробнее».
    if (item.inactive) {
      return (
        <Button size="small" variant="outlined" color="warning" onClick={() => askVisibility(item, false)}>
          Сделать активным
        </Button>
      );
    }
    // Без модуля переключать нечего: оператор идёт в настройки возможности.
    if (item.product.modules.length === 0) return routeButton(item);
    const module = item.product.modules.length === 1 ? catalogByCode.get(item.product.modules[0]) : undefined;
    if (!module) {
      return (
        <Button size="small" onClick={() => setDrawerId(item.product.id)}>
          Управлять
        </Button>
      );
    }
    const route = MODULE_SETTINGS_ROUTE[module.code];
    const actions = catalogActions(module, { isPlatformAdmin: true, hasSettingsRoute: Boolean(route) });
    return (
      <Stack direction="row" spacing={0.5}>
        {actions.includes("configure") && route && (
          <Button size="small" onClick={() => navigate(route)}>
            Настроить
          </Button>
        )}
        {actions.includes("disable") && (
          <Button size="small" color="error" onClick={() => askToggle(module, false)}>
            Отключить
          </Button>
        )}
        {actions.includes("enable") && (
          <Button size="small" startIcon={<AddOutlined />} onClick={() => askToggle(module, true)}>
            Подключить
          </Button>
        )}
      </Stack>
    );
  };

  const drawerAction = (item: StorefrontItem): React.ReactNode => {
    // Оператору переключатели модулей — ниже; у товара без модуля — переход в его настройки.
    if (isOperator) {
      return item.product.modules.length === 0 ? routeButton(item, { variant: "outlined", fullWidth: true }) : null;
    }
    if (item.status === "requested" || item.pendingDisconnect) {
      return (
        <Alert severity="warning" variant="outlined">
          {item.pendingDisconnect ? "Заявка на отключение отправлена" : "Заявка отправлена"} — менеджер свяжется с вами.
        </Alert>
      );
    }
    if (item.status === "available" || item.status === "soon") {
      return canConnect ? (
        <Button variant="contained" size="large" fullWidth onClick={() => askRequest(itemTarget(item))}>
          {item.status === "soon" ? "Узнать о запуске" : "Отправить заявку"}
        </Button>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Подключить может сотрудник с правом «Подключение модулей».
        </Typography>
      );
    }
    return (
      <Stack spacing={1}>
        {routeButton(item, { variant: "outlined", fullWidth: true })}
        {canAskOff(item) && (
          <Button color="error" fullWidth onClick={() => askRequest(disconnectTarget(item))}>
            Отключить — заявка менеджеру
          </Button>
        )}
      </Stack>
    );
  };

  const drawerOperator = (item: StorefrontItem): React.ReactNode =>
    isOperator ? (
      <Box>
        <Typography variant="overline" color="text.secondary">
          Оператор платформы
        </Typography>
        <Stack spacing={1}>
          {/* Статус на всей платформе: скрывает товар сразу у всех клиник. */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="body2">
              {item.inactive ? "Неактивен — клиники не видят" : "Клиники видят на витрине"}
            </Typography>
            {item.inactive ? (
              <Button size="small" onClick={() => askVisibility(item, false)}>
                Сделать активным
              </Button>
            ) : (
              <Button size="small" color="warning" onClick={() => askVisibility(item, true)}>
                Сделать неактивным
              </Button>
            )}
          </Stack>
          {item.product.modules.map((code) => {
            const module = catalogByCode.get(code);
            if (!module) return null;
            return (
              <Stack key={code} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography variant="body2">
                  {module.name} — {module.isEnabled ? "включён" : "выключен"}
                </Typography>
                {module.isEnabled ? (
                  <Button size="small" color="error" onClick={() => askToggle(module, false)}>
                    Отключить
                  </Button>
                ) : (
                  <Button size="small" onClick={() => askToggle(module, true)}>
                    Подключить
                  </Button>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Box>
    ) : null;

  const includedAction = (entry: IncludedItem): React.ReactNode => {
    const { module } = entry;
    if (!module) return null;
    if (isOperator) {
      return module.isEnabled ? (
        <Button size="small" color="error" onClick={() => askToggle(module, false)}>
          Отключить
        </Button>
      ) : (
        <Button size="small" startIcon={<AddOutlined />} onClick={() => askToggle(module, true)}>
          Включить
        </Button>
      );
    }
    // Модуль пакета клиника с правом переключает сама, без заявки и доплаты.
    if (!entry.selfService) return null;
    if (module.isEnabled) {
      return canDisconnect ? (
        <Button size="small" color="error" onClick={() => askToggle(module, false, true)}>
          Отключить
        </Button>
      ) : null;
    }
    return canConnect ? (
      <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={() => askToggle(module, true, true)}>
        Включить
      </Button>
    ) : null;
  };

  if (catalogQuery.isLoading || featuresQuery.isLoading || inactiveQuery.isLoading) {
    return (
      <SettingsLayout>
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      </SettingsLayout>
    );
  }
  if (catalogQuery.isError) {
    return (
      <SettingsLayout>
        <Alert severity="error">Не удалось загрузить каталог модулей. Обновите страницу.</Alert>
      </SettingsLayout>
    );
  }

  const filters = [
    { id: "all", label: "Все" },
    ...storefront.categories.map((c) => ({ id: c.id as string, label: c.label })),
    { id: "connected", label: `Подключённые · ${storefront.connectedCount}` },
  ];
  const nothingFound = searching && found.items.length === 0 && found.included.length === 0;

  return (
    <SettingsLayout>
      {/* Корень и секции — Stack, последний блок — тоже Stack: мобильный SettingsLayout
          растягивает кнопки в последнем Box-потомке корня. Шапка — Stack + h6,
          как у соседних страниц настроек. */}
      <Stack spacing={3} sx={{ maxWidth: 1100, mx: "auto", width: "100%" }}>
        <Stack gap={0.5}>
          <Typography variant="h6" fontWeight={600}>
            Модули
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Подключайте возможности, когда они нужны. Помесячно, без внедрения и переустановки.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip
              size="small"
              variant="outlined"
              color="success"
              icon={<CheckCircleOutlined />}
              label={`Подключено ${storefront.connectedCount}`}
            />
            <Chip size="small" variant="outlined" label={`Доступно ${storefront.availableCount}`} />
            {isOperator && hiddenCount > 0 && (
              <Chip
                size="small"
                color="warning"
                icon={<VisibilityOffOutlined />}
                label={`Скрыто от клиник ${hiddenCount}`}
              />
            )}
          </Stack>
          {/* Только суперпользователю: он видит все модули платформы, а так —
              меню глазами сотрудников выбранной организации. Со старым бэком
              (нет organizationModules) переключателя нет. */}
          {isOperator && organizationModules != null && (
            <FormControlLabel
              sx={{ mt: 0.5, mr: 0, alignItems: "flex-start" }}
              control={
                <Switch
                  size="small"
                  checked={Boolean(viewAsOrganization)}
                  onChange={(_, on) => setViewAsOrganization?.(on)}
                />
              }
              label={
                <Box sx={{ pt: 0.25 }}>
                  <Typography variant="body2">Меню как у клиники</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Показывать только модули, подключённые у «{orgName}», — как их видят сотрудники. Сбросится при
                    перезагрузке страницы.
                  </Typography>
                </Box>
              }
            />
          )}
        </Stack>

        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти: инвентаризация, зарплата, запись…"
          size="small"
          fullWidth
          slotProps={{
            htmlInput: { "aria-label": "Поиск по модулям" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searching ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Очистить поиск" onClick={() => setSearch("")}>
                    <ClearOutlined fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />

        {nothingFound && (
          <Typography variant="body2" color="text.secondary">
            По запросу «{search.trim()}» ничего не нашлось. Попробуйте другое слово.
          </Typography>
        )}

        {!searching && storefront.bundles.length > 0 && (
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>
              {RECOMMEND_TITLE[vertical]}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
              {storefront.bundles.map((view, index) => (
                <BundleCard
                  key={view.bundle.id}
                  view={view}
                  featured={index === 0}
                  action={
                    isOperator || !canConnect ? undefined : (
                      <Button
                        size="small"
                        variant={index === 0 ? "contained" : "outlined"}
                        onClick={() => askRequest(bundleTarget(view))}
                      >
                        {view.price === null ? "Узнать" : "Подключить всё"}
                      </Button>
                    )
                  }
                />
              ))}
            </Box>
          </Stack>
        )}

        {(!searching || shelf.length > 0) && (
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>
              Дополнительные модули
            </Typography>
            {!searching && (
              <Stack
                direction="row"
                spacing={1}
                sx={{ overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}
              >
                {filters.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.label}
                    clickable
                    color={filter === f.id ? "primary" : "default"}
                    variant={filter === f.id ? "filled" : "outlined"}
                    onClick={() => setFilter(f.id)}
                  />
                ))}
              </Stack>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: GRID, gap: 1.5 }}>
              {onShelf.map(({ item, parts }) => (
                <ProductCard
                  key={item.product.id}
                  item={item}
                  highlight={parts}
                  action={isOperator ? operatorAction(item) : clinicAction(item)}
                  onOpen={() => setDrawerId(item.product.id)}
                />
              ))}
            </Box>
            {!searching && shelf.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                В этом разделе пока ничего нет.
              </Typography>
            )}
            {hiddenShelf.length > 0 && (
              <Stack spacing={1.5} sx={{ pt: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <VisibilityOffOutlined color="warning" fontSize="small" />
                  <Typography variant="subtitle1" fontWeight={700}>
                    Неактивные · {hiddenShelf.length}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: "4px !important" }}>
                  Клиники их не видят и не могут заказать. Видите только вы.
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: GRID, gap: 1.5 }}>
                  {hiddenShelf.map(({ item, parts }) => (
                    <ProductCard
                      key={item.product.id}
                      item={item}
                      highlight={parts}
                      action={operatorAction(item)}
                      onOpen={() => setDrawerId(item.product.id)}
                    />
                  ))}
                </Box>
              </Stack>
            )}
          </Stack>
        )}

        {found.included.length > 0 && (
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Входит в ваш пакет
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Уже есть в вашей CRM — без доплаты.
              </Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: GRID, gap: 1.5 }}>
              {found.included.map(({ item, parts }) => (
                <IncludedCard key={item.card.id} item={item} highlight={parts} action={includedAction(item)} />
              ))}
            </Box>
          </Stack>
        )}
      </Stack>

      <ProductDrawer
        item={drawerItem}
        onClose={() => setDrawerId(null)}
        action={drawerItem ? drawerAction(drawerItem) : null}
        operator={drawerItem ? drawerOperator(drawerItem) : null}
      />

      <RequestDialog
        target={requestTarget}
        open={requestOpen}
        defaultName={activeEmployee?.fullName ?? ""}
        defaultPhone={activeEmployee?.phone ?? ""}
        submitting={sendRequest.isPending}
        onSubmit={(contact) => {
          if (requestTarget) sendRequest.mutate({ target: requestTarget, contact });
        }}
        onClose={() => setRequestOpen(false)}
        onExited={() => setRequestTarget(null)}
      />

      <Dialog
        open={toggleOpen}
        onClose={() => {
          if (!toggle.isPending) setToggleOpen(false);
        }}
        slotProps={{ transition: { onExited: () => setPending(null) } }}
      >
        <DialogTitle>
          {pending?.selfService
            ? `${pending.enable ? "Включить" : "Отключить"} «${pending.module.name}»?`
            : pending?.enable
              ? "Подключить модуль?"
              : "Отключить модуль?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending?.selfService
              ? pending.enable
                ? "Входит в ваш пакет — без доплаты. Разделы модуля сразу появятся у сотрудников."
                : "Разделы модуля пропадут у сотрудников. Права в ролях сохранятся и вернутся, когда модуль снова включат."
              : pending?.enable
                ? `Подключить «${pending.module.name}» для «${pending.organizationName}»? Модуль появится в CRM клиники.`
                : `Отключить «${pending?.module.name ?? ""}» у «${pending?.organizationName ?? ""}»? Разделы модуля пропадут у сотрудников клиники. Права в ролях сохранятся и вернутся при подключении.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToggleOpen(false)} disabled={toggle.isPending}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color={pending?.enable ? "primary" : "error"}
            disabled={toggle.isPending || !toggleOpen}
            onClick={() => {
              if (pending) toggle.mutate(pending);
            }}
          >
            {pending?.enable ? (pending.selfService ? "Включить" : "Подключить") : "Отключить"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={visibilityOpen}
        onClose={() => {
          if (!changeVisibility.isPending) setVisibilityOpen(false);
        }}
        fullWidth
        maxWidth="xs"
        slotProps={{ transition: { onExited: () => setVisibility(null) } }}
      >
        <DialogTitle>
          {visibility?.inactive
            ? `Сделать «${visibility.title}» неактивным?`
            : `Сделать «${visibility?.title ?? ""}» активным?`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <DialogContentText>
              {visibility?.inactive
                ? "Все клиники перестанут видеть товар на витрине и не смогут оставить на него заявку. Вы будете видеть его в конце витрины с пометкой «Неактивен»."
                : "Товар снова появится на витрине у всех клиник."}
            </DialogContentText>
            {visibility?.inactive && (
              <TextField
                label="Причина"
                helperText="Видят только суперпользователи"
                value={visibilityReason}
                onChange={(e) => setVisibilityReason(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 300 } }}
                fullWidth
                multiline
                minRows={2}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVisibilityOpen(false)} disabled={changeVisibility.isPending}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color={visibility?.inactive ? "warning" : "primary"}
            disabled={changeVisibility.isPending || !visibilityOpen}
            onClick={() => {
              if (visibility) changeVisibility.mutate({ ...visibility, reason: visibilityReason });
            }}
          >
            {visibility?.inactive ? "Сделать неактивным" : "Сделать активным"}
          </Button>
        </DialogActions>
      </Dialog>

      {notice && (
        <Snackbar
          open
          autoHideDuration={notice.severity === "error" ? 10000 : 5000}
          onClose={() => setNotice(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ maxWidth: 560 }}>
            {notice.text}
          </Alert>
        </Snackbar>
      )}
    </SettingsLayout>
  );
};

export default ModulesCatalogPage;
