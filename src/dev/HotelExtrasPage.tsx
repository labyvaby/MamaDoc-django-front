/**
 * «Услуги и юрлица» — справочники отеля, из которых набирается счёт гостя.
 *
 * Услуги: мини-бар, прачечная, трансфер с ценой по умолчанию. Цена и
 * название фиксируются в начислении, поэтому правка справочника старые счета
 * не меняет. Убрать услугу значит архивировать: сохранённые начисления
 * остаются.
 *
 * Юрлица: название, ИНН, реквизиты, договор, скидка. Бронь привязывается к
 * юрлицу в своей карточке; скидка действует на проживание, не на допуслуги.
 * Непустой ИНН уникален в объекте. Бэк: /hotel/extra-services/ и
 * /hotel/corporate-accounts/ (чтение hotel.view, запись hotel.manage).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import RoomServiceOutlined from "@mui/icons-material/RoomServiceOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import FingerprintOutlined from "@mui/icons-material/FingerprintOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  archiveCorporateAccount,
  archiveExtraService,
  createCorporateAccount,
  createExtraService,
  listCorporateAccounts,
  listExtraServices,
  updateCorporateAccount,
  updateExtraService,
  type HotelCorporateAccount,
  type HotelExtraService,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { hasFieldErrors, GUEST_RULES, type FieldRules } from "./formRules";
import { EmptyState, HotelPage, HotelPageHeader, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import { useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";

const RULES = {
  name: { required: true, maxLength: 120 },
  price: { kind: "decimal", required: true, min: 0, max: 10_000_000, maxDecimals: 2 },
  inn: { kind: "int", maxLength: 14 },
  discount: { kind: "decimal", required: true, min: 0, max: 100, maxDecimals: 2 },
  text: { maxLength: 1000 },
} satisfies Record<string, FieldRules>;

const money = (v: string | number) => Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const PAGE = 100;

export const HotelExtrasPage: React.FC = () => {
  usePageTitle("Услуги и юрлица");
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const [tab, setTab] = React.useState<"services" | "corporate">("services");

  if (!vivaActive) return <Navigate to="/" replace />;

  return (
    <HotelPage>
      <HotelPageHeader
        title="Услуги и юрлица"
        subtitle={tab === "services" ? "Допуслуги для счёта гостя" : "Компании со скидкой и договором"}
        info={
          <>
            Услуги — то, что добавляют в счёт брони сверх проживания: мини-бар, прачечная, поздний выезд. Юрлица — компании, на
            которых бронируют: скидка юрлица действует на проживание, но не на услуги. Изменение справочника не меняет уже
            выставленные счета и привязанные брони.
          </>
        }
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, mt: -1, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}>
        <Tab value="services" label="Услуги" />
        <Tab value="corporate" label="Юрлица" />
      </Tabs>
      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : property ? (
        tab === "services" ? <ServicesPanel propertyId={property.id} /> : <CorporatePanel propertyId={property.id} />
      ) : null}
    </HotelPage>
  );
};

// ── Услуги ──────────────────────────────────────────────────────────────────

const ServicesPanel: React.FC<{ propertyId: number }> = ({ propertyId }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const canManage = useCan("hotel.manage");
  const [search, setSearch] = React.useState("");
  const q = useDebouncedValue(search.trim());
  const [editing, setEditing] = React.useState<HotelExtraService | "new" | null>(null);
  const query = useQuery({
    queryKey: ["hotel", "extraServices", propertyId, "all", q],
    queryFn: ({ signal }) => listExtraServices(propertyId, { q: q || undefined, includeInactive: true, limit: PAGE }, signal),
  });
  const rows = query.data?.results ?? [];

  return (
    <>
      <Toolbar search={search} onSearch={setSearch} actionLabel="Добавить услугу" canAdd={canManage} onAdd={() => setEditing("new")} />
      {query.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(query.error, "Не удалось загрузить услуги")}
        </Alert>
      ) : query.isPending ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<RoomServiceOutlined />}
            title={q ? "Ничего не найдено" : "Услуг пока нет"}
            description={q ? "Проверьте название." : "Заведите мини-бар, прачечную, трансфер — их можно будет добавлять в счёт брони в один клик."}
          />
        </Surface>
      ) : (
        <Surface padded={false} sx={{ overflow: "hidden" }}>
          <Table sx={tableSx}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 2.5 }}>Услуга</TableCell>
                <TableCell align="right">Цена</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} hover={canManage} onClick={canManage ? () => setEditing(s) : undefined} sx={{ cursor: canManage ? "pointer" : "default", opacity: s.isActive ? 1 : 0.55 }}>
                  <TableCell sx={{ pl: 2.5, fontWeight: 600 }}>{s.name}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {money(s.price)} сом
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 2 }}>
                    {!s.isActive && <StatusPill color={theme.palette.text.disabled} label="В архиве" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
      <ServiceDialog target={editing} propertyId={propertyId} onClose={() => setEditing(null)} />
    </>
  );
};

const ServiceDialog: React.FC<{ target: HotelExtraService | "new" | null; propertyId: number; onClose: () => void }> = ({ target, propertyId, onClose }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const item = target && target !== "new" ? target : null;
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (target == null) return;
    setName(item?.name ?? "");
    setPrice(item ? String(Number(item.price)) : "");
    setActive(item?.isActive ?? true);
    setShowErrors(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const save = async () => {
    if (hasFieldErrors([[name, RULES.name], [price, RULES.price]])) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = { name: name.trim(), price: String(Number(price)) };
      if (item) await updateExtraService(item.id, { ...data, isActive: active });
      else await createExtraService({ propertyId, ...data });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "extraServices"] });
      enqueueSnackbar(item ? "Услуга сохранена" : `Услуга «${data.name}» добавлена`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить услугу"));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await archiveExtraService(item.id);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "extraServices"] });
      enqueueSnackbar(`«${item.name}» убрана в архив — выставленные счета не изменились`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось убрать услугу"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target != null} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>{item ? item.name : "Новая услуга"}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormField icon={<RoomServiceOutlined />} label="Название" placeholder="Прачечная" value={name} onValueChange={setName} rules={RULES.name} showErrors={showErrors} disabled={saving} autoFocus={!item} fullWidth />
          <FormField icon={<SellOutlined />} label="Цена по умолчанию" unit="сом" value={price} onValueChange={setPrice} rules={RULES.price} showErrors={showErrors} disabled={saving} helperText="В счёт можно поставить и другую цену" fullWidth />
          {item && (
            <FormControlLabel
              control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} disabled={saving} />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    В справочнике
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Выключенная услуга не предлагается в новых счетах
                  </Typography>
                </Box>
              }
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {item && item.isActive && (
          <Button color="error" onClick={() => void archive()} disabled={saving} sx={{ mr: "auto" }}>
            В архив
          </Button>
        )}
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving}>
          {saving ? "Сохраняем…" : item ? "Сохранить" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Юрлица ──────────────────────────────────────────────────────────────────

const CorporatePanel: React.FC<{ propertyId: number }> = ({ propertyId }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const canManage = useCan("hotel.manage");
  const [search, setSearch] = React.useState("");
  const q = useDebouncedValue(search.trim());
  const [editing, setEditing] = React.useState<HotelCorporateAccount | "new" | null>(null);
  const query = useQuery({
    queryKey: ["hotel", "corporateAccounts", propertyId, "all", q],
    queryFn: ({ signal }) => listCorporateAccounts(propertyId, { q: q || undefined, includeInactive: true, limit: PAGE }, signal),
  });
  const rows = query.data?.results ?? [];

  return (
    <>
      <Toolbar search={search} onSearch={setSearch} actionLabel="Добавить юрлицо" canAdd={canManage} onAdd={() => setEditing("new")} />
      {query.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(query.error, "Не удалось загрузить юрлица")}
        </Alert>
      ) : query.isPending ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<BusinessOutlined />}
            title={q ? "Ничего не найдено" : "Юрлиц пока нет"}
            description={q ? "Проверьте название или ИНН." : "Заведите компанию с договором и скидкой — бронь привяжется к ней в своей карточке."}
          />
        </Surface>
      ) : (
        <Surface padded={false} sx={{ overflow: "hidden" }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={tableSx}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 2.5 }}>Компания</TableCell>
                  <TableCell>ИНН</TableCell>
                  <TableCell>Договор</TableCell>
                  <TableCell align="right">Скидка</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} hover={canManage} onClick={canManage ? () => setEditing(a) : undefined} sx={{ cursor: canManage ? "pointer" : "default", opacity: a.isActive ? 1 : 0.55 }}>
                    <TableCell sx={{ pl: 2.5, fontWeight: 600 }}>{a.name}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{a.inn || "—"}</TableCell>
                    <TableCell sx={{ color: a.contract ? "text.primary" : "text.disabled", maxWidth: 260 }}>
                      <Typography variant="body2" noWrap title={a.contract}>
                        {a.contract || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {Number(a.discountPercent) > 0 ? `${money(a.discountPercent)}%` : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ pr: 2 }}>
                      {!a.isActive && <StatusPill color={theme.palette.text.disabled} label="В архиве" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Surface>
      )}
      <CorporateDialog target={editing} propertyId={propertyId} onClose={() => setEditing(null)} />
    </>
  );
};

const CorporateDialog: React.FC<{ target: HotelCorporateAccount | "new" | null; propertyId: number; onClose: () => void }> = ({ target, propertyId, onClose }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const item = target && target !== "new" ? target : null;
  const [form, setForm] = React.useState({ name: "", inn: "", bankDetails: "", contract: "", discount: "0", active: true });
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (target == null) return;
    setForm({
      name: item?.name ?? "",
      inn: item?.inn ?? "",
      bankDetails: item?.bankDetails ?? "",
      contract: item?.contract ?? "",
      discount: item ? String(Number(item.discountPercent)) : "0",
      active: item?.isActive ?? true,
    });
    setShowErrors(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (
      hasFieldErrors([
        [form.name, RULES.name],
        [form.inn, RULES.inn],
        [form.discount, RULES.discount],
        [form.bankDetails, RULES.text],
        [form.contract, GUEST_RULES.long],
      ])
    ) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = {
        name: form.name.trim(),
        inn: form.inn.trim(),
        bankDetails: form.bankDetails.trim(),
        contract: form.contract.trim(),
        discountPercent: String(Number(form.discount)),
      };
      if (item) await updateCorporateAccount(item.id, { ...data, isActive: form.active });
      else await createCorporateAccount(propertyId, data);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "corporateAccounts"] });
      enqueueSnackbar(item ? "Юрлицо сохранено" : `Юрлицо «${data.name}» добавлено`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить юрлицо"));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await archiveCorporateAccount(item.id);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "corporateAccounts"] });
      enqueueSnackbar(`«${item.name}» убрано в архив — привязанные брони не изменились`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось убрать юрлицо"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target != null} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>{item ? item.name : "Новое юрлицо"}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormField icon={<BusinessOutlined />} label="Название" placeholder="ОсОО «Компания»" value={form.name} onValueChange={(v) => set("name", v)} rules={RULES.name} showErrors={showErrors} disabled={saving} autoFocus={!item} fullWidth />
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <FormField icon={<FingerprintOutlined />} label="ИНН" value={form.inn} onValueChange={(v) => set("inn", v)} rules={RULES.inn} showErrors={showErrors} disabled={saving} sx={{ flex: 1 }} />
            <FormField icon={<PercentOutlined />} label="Скидка" unit="%" value={form.discount} onValueChange={(v) => set("discount", v)} rules={RULES.discount} showErrors={showErrors} disabled={saving} helperText="На проживание, не на услуги" sx={{ flex: 1 }} />
          </Stack>
          <FormField icon={<DescriptionOutlined />} label="Договор" placeholder="Договор №12 от 01.10.2026" value={form.contract} onValueChange={(v) => set("contract", v)} rules={GUEST_RULES.long} showErrors={showErrors} disabled={saving} fullWidth />
          <FormField icon={<AccountBalanceOutlined />} label="Банковские реквизиты" placeholder="Банк, БИК, расчётный счёт" value={form.bankDetails} onValueChange={(v) => set("bankDetails", v)} rules={RULES.text} showErrors={showErrors} disabled={saving} multiline minRows={2} fullWidth />
          {item && (
            <FormControlLabel
              control={<Switch checked={form.active} onChange={(e) => set("active", e.target.checked)} disabled={saving} />}
              label={
                <Typography variant="body2" fontWeight={600}>
                  Активно
                </Typography>
              }
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {item && item.isActive && (
          <Button color="error" onClick={() => void archive()} disabled={saving} sx={{ mr: "auto" }}>
            В архив
          </Button>
        )}
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving}>
          {saving ? "Сохраняем…" : item ? "Сохранить" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const Toolbar: React.FC<{ search: string; onSearch: (v: string) => void; actionLabel: string; canAdd: boolean; onAdd: () => void }> = ({
  search,
  onSearch,
  actionLabel,
  canAdd,
  onAdd,
}) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
    <TextField
      size="small"
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      placeholder="Поиск"
      sx={{ width: { xs: "100%", sm: 280 } }}
      slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
    />
    {canAdd && (
      <Button variant="contained" disableElevation startIcon={<AddOutlined />} onClick={onAdd}>
        {actionLabel}
      </Button>
    )}
  </Stack>
);

const Loader: React.FC = () => (
  <Stack alignItems="center" sx={{ py: 6 }}>
    <CircularProgress size={28} />
  </Stack>
);

export default HotelExtrasPage;
