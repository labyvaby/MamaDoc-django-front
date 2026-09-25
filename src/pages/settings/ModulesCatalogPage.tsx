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
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import { type CatalogModule, createModuleRequest, setOrganizationModule } from "../../api/tenancy";
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
  includedTarget,
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

/** Подтверждаемое переключение оператора. Организация фиксируется в момент нажатия. */
type PendingToggle = { module: CatalogModule; enable: boolean; organizationId: number; organizationName: string };
/** Заявка клиники — тоже с организацией на момент нажатия. */
type PendingRequest = RequestTarget & { organizationId: number };
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
  const {
    isPlatformAdmin,
    activeOrganization,
    activeEmployee,
    organizationModules,
    viewAsOrganization,
    setViewAsOrganization,
  } = usePermissions();
  // Переключает модули только суперпользователь платформы; клиника шлёт заявку.
  const isOperator = Boolean(isPlatformAdmin && activeOrganization);
  const orgName = activeOrganization?.name ?? "организации";
  const vertical = storefrontVertical(activeOrganization?.vertical);

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<PendingRequest | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const catalogByCode = useMemo(() => new Map(catalog.map((m) => [m.code, m])), [catalog]);
  const storefront = useMemo(
    () =>
      buildStorefront({
        catalog,
        vertical,
        openRequests: requestsQuery.data ?? [],
        // Признаки не пришли — товары без модуля не показываем, а не предлагаем вслепую.
        signals: featuresQuery.data ?? null,
        operator: isOperator,
      }),
    [catalog, vertical, requestsQuery.data, featuresQuery.data, isOperator],
  );
  const searching = search.trim().length > 0;
  const found = useMemo(() => searchStorefront(storefront, search), [storefront, search]);
  // Поиск идёт по всей витрине, фильтр-чипы — только без поиска.
  const shelf = searching
    ? found.items
    : found.items.filter(({ item }) =>
        filter === "all" ? true : filter === "connected" ? item.status === "connected" : item.product.category === filter,
      );
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
    mutationFn: (p: PendingToggle) => setOrganizationModule(p.organizationId, p.module.code, p.enable),
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
      }),
    onSuccess: (_, { target }) => {
      setNotice({
        severity: "success",
        text:
          target.kind === "soon"
            ? "Заявка отправлена. Расскажем о запуске."
            : "Заявка отправлена. Менеджер свяжется с вами.",
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

  const askToggle = (module: CatalogModule, enable: boolean) => {
    if (!activeOrganization) return;
    setPending({ module, enable, organizationId: activeOrganization.id, organizationName: activeOrganization.name });
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

  const clinicAction = (item: StorefrontItem): React.ReactNode => {
    if (item.status === "available") {
      return (
        <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => askRequest(itemTarget(item))}>
          {item.product.price === null ? "Узнать" : "Подключить"}
        </Button>
      );
    }
    if (item.status === "soon") {
      return (
        <Button size="small" variant="outlined" onClick={() => askRequest(itemTarget(item))}>
          Узнать о запуске
        </Button>
      );
    }
    return item.status === "connected" ? routeButton(item) : null;
  };

  const operatorAction = (item: StorefrontItem): React.ReactNode => {
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
    if (item.status === "requested") {
      return (
        <Alert severity="warning" variant="outlined">
          Заявка отправлена — менеджер свяжется с вами.
        </Alert>
      );
    }
    if (item.status === "available" || item.status === "soon") {
      return (
        <Button variant="contained" size="large" fullWidth onClick={() => askRequest(itemTarget(item))}>
          {item.status === "soon" ? "Узнать о запуске" : "Отправить заявку"}
        </Button>
      );
    }
    return routeButton(item, { variant: "outlined", fullWidth: true });
  };

  const drawerOperator = (item: StorefrontItem): React.ReactNode =>
    isOperator && item.product.modules.length > 0 ? (
      <Box>
        <Typography variant="overline" color="text.secondary">
          Оператор платформы
        </Typography>
        <Stack spacing={1}>
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
    return entry.status === "off" ? (
      <Button size="small" variant="outlined" onClick={() => askRequest(includedTarget(entry))}>
        Включить
      </Button>
    ) : null;
  };

  if (catalogQuery.isLoading || featuresQuery.isLoading) {
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
                    isOperator ? undefined : (
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
              {shelf.map(({ item, parts }) => (
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
        <DialogTitle>{pending?.enable ? "Подключить модуль?" : "Отключить модуль?"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending?.enable
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
            {pending?.enable ? "Подключить" : "Отключить"}
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
