/**
 * «Тарифные планы» — условия продажи номера: «Основной» (цены категорий) и
 * производные от него — «Невозвратный −10%», «С завтраком +500 сом» и т.п.
 * У плана — питание, минимум ночей, предоплата, условия отмены и для каких
 * категорий он действует. Цена производного = цена родителя ± поправка,
 * бэк считает её сам (видно в «Календаре цен» по выбранному плану).
 *
 * Бэк: /hotel/rate-plans/ (чтение hotel.view, запись hotel.rates.manage).
 * Удаления нет — план выключают: уже проданные по нему брони остаются.
 * «Основной» выключить нельзя.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import TagOutlined from "@mui/icons-material/TagOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { createRatePlan, listRatePlans, listRoomTypes, updateRatePlan, type HotelRatePlan } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import { hasFieldErrors, type FieldRules } from "./formRules";
import { HOTEL_BOARD_TYPE_LABELS } from "./hotelDisplay";
import { DRAWER_WIDTH, DrawerFooter, DrawerHeader, DrawerSection, EmptyState, HotelPage, HotelPageHeader, StatusPill, Surface } from "./hotelUi";
import { useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";

const RULES = {
  name: { required: true, maxLength: 120 },
  code: { maxLength: 32 },
  percent: { kind: "decimal", required: true, min: -90, max: 500, maxDecimals: 2 },
  amount: { kind: "decimal", required: true, min: -1_000_000, max: 1_000_000, maxDecimals: 2 },
  minNights: { kind: "int", required: true, min: 1, max: 90, maxLength: 2 },
  prepayment: { kind: "decimal", required: true, min: 0, max: 100, maxDecimals: 0 },
  text: { maxLength: 1000 },
} satisfies Record<string, FieldRules>;

const MEAL_PLANS = Object.keys(HOTEL_BOARD_TYPE_LABELS);

function adjustmentLabel(plan: HotelRatePlan, parentName: string | undefined): string {
  if (plan.isBase) return "цены категорий";
  if (plan.parentId == null) return "цены категорий";
  const v = Number(plan.adjustmentValue);
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  const abs = Math.abs(v).toLocaleString("ru-RU");
  return `${parentName ? `«${parentName}» ` : ""}${sign}${abs}${plan.adjustmentType === "percent" ? "%" : " сом за ночь"}`;
}

export const HotelRatePlansPage: React.FC = () => {
  usePageTitle("Тарифные планы");
  const theme = useTheme();
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canManage = useCan("hotel.rates.manage");
  const [editing, setEditing] = React.useState<HotelRatePlan | "new" | null>(null);

  const plansQuery = useQuery({
    queryKey: ["hotel", "ratePlans", property?.id, "all"],
    queryFn: ({ signal }) => listRatePlans(property!.id, signal, { includeInactive: true }),
    enabled: property != null,
  });
  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const plans = React.useMemo(
    () => [...(plansQuery.data ?? [])].sort((a, b) => Number(b.isBase) - Number(a.isBase) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "ru")),
    [plansQuery.data],
  );
  const roomTypes = roomTypesQuery.data ?? [];
  const byId = new Map(plans.map((p) => [p.id, p]));
  const typeName = new Map(roomTypes.map((t) => [t.id, t.name]));

  if (!vivaActive) return <Navigate to="/" replace />;

  const active = plans.filter((p) => p.isActive).length;

  return (
    <HotelPage>
      <HotelPageHeader
        title="Тарифные планы"
        subtitle={plansQuery.isSuccess ? `${active} ${active === 1 ? "действует" : "действуют"}${plans.length > active ? ` · ${plans.length - active} выключено` : ""}` : undefined}
        info={
          <>
            Тариф — условия продажи номера: питание, минимум ночей, предоплата, отмена. «Основной» продаётся по ценам категорий,
            остальные — от него со скидкой или наценкой (например, «Невозвратный −10%»). Цены по тарифу видно в «Календаре
            цен», тариф выбирают при создании брони.
          </>
        }
        actions={
          canManage ? (
            <Button variant="contained" disableElevation startIcon={<AddOutlined />} onClick={() => setEditing("new")} disabled={!property || plans.length === 0}>
              Добавить тариф
            </Button>
          ) : undefined
        }
      />

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : plansQuery.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(plansQuery.error, "Не удалось загрузить тарифы")}
        </Alert>
      ) : !plansQuery.data ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : plans.length === 0 ? (
        <Surface>
          <EmptyState icon={<LocalOfferOutlined />} title="Тарифов нет" description="Основной тариф появится, когда будет заведён объект размещения." />
        </Surface>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 2, alignItems: "start" }}>
          {plans.map((plan) => {
            const parent = plan.parentId != null ? byId.get(plan.parentId) : undefined;
            const rows: [string, string][] = [
              ["Цена", adjustmentLabel(plan, parent?.name)],
              ["Питание", HOTEL_BOARD_TYPE_LABELS[plan.mealPlan] ?? plan.mealPlan],
              ["Минимум ночей", String(plan.minNights)],
              ["Предоплата", Number(plan.prepaymentPercent) > 0 ? `${Number(plan.prepaymentPercent)}%` : "не нужна"],
              ["Категории", plan.roomTypeIds.length ? plan.roomTypeIds.map((id) => typeName.get(id) ?? `№${id}`).join(", ") : "все"],
            ];
            return (
              <Surface
                key={plan.id}
                component={canManage ? "button" : "div"}
                onClick={canManage ? () => setEditing(plan) : undefined}
                sx={{
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  width: "100%",
                  cursor: canManage ? "pointer" : "default",
                  opacity: plan.isActive ? 1 : 0.6,
                  "&:hover": canManage ? { borderColor: "text.secondary" } : undefined,
                }}
              >
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }} flexWrap="wrap">
                  <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{plan.name}</Typography>
                  {plan.code && <Chip size="small" label={plan.code} variant="outlined" sx={{ height: 22, fontSize: 11, fontWeight: 700 }} />}
                  {plan.isBase && <StatusPill color={theme.palette.primary.main} label="Основной" />}
                  {!plan.isActive && <StatusPill color={theme.palette.text.disabled} label="Выключен" />}
                </Stack>
                <Stack gap={0.5}>
                  {rows.map(([label, value]) => (
                    <Stack key={label} direction="row" justifyContent="space-between" gap={2}>
                      <Typography variant="body2" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ textAlign: "right" }}>
                        {value}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
                {plan.cancellationPolicy && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.25, whiteSpace: "pre-wrap" }}>
                    Отмена: {plan.cancellationPolicy}
                  </Typography>
                )}
              </Surface>
            );
          })}
        </Box>
      )}

      {property && (
        <RatePlanDrawer
          target={editing}
          propertyId={property.id}
          plans={plans}
          roomTypes={roomTypes.map((t) => ({ id: t.id, name: t.name }))}
          onClose={() => setEditing(null)}
        />
      )}
    </HotelPage>
  );
};

interface PlanForm {
  name: string;
  code: string;
  parentId: number | "";
  adjustmentType: "percent" | "amount";
  adjustmentValue: string;
  mealPlan: string;
  minNights: string;
  prepayment: string;
  roomTypeIds: number[];
  cancellationPolicy: string;
  includedServices: string;
  isActive: boolean;
}

const formFrom = (p: HotelRatePlan | null, baseId: number | undefined): PlanForm =>
  p
    ? {
        name: p.name,
        code: p.code,
        parentId: p.parentId ?? "",
        adjustmentType: p.adjustmentType,
        adjustmentValue: String(Number(p.adjustmentValue)),
        mealPlan: p.mealPlan,
        minNights: String(p.minNights),
        prepayment: String(Number(p.prepaymentPercent)),
        roomTypeIds: p.roomTypeIds,
        cancellationPolicy: p.cancellationPolicy,
        includedServices: p.includedServices,
        isActive: p.isActive,
      }
    : {
        name: "",
        code: "",
        parentId: baseId ?? "",
        adjustmentType: "percent",
        adjustmentValue: "-10",
        mealPlan: "none",
        minNights: "1",
        prepayment: "0",
        roomTypeIds: [],
        cancellationPolicy: "",
        includedServices: "",
        isActive: true,
      };

const RatePlanDrawer: React.FC<{
  target: HotelRatePlan | "new" | null;
  propertyId: number;
  plans: HotelRatePlan[];
  roomTypes: { id: number; name: string }[];
  onClose: () => void;
}> = ({ target, propertyId, plans, roomTypes, onClose }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const plan = target && target !== "new" ? target : null;
  const base = plans.find((p) => p.isBase);
  const [form, setForm] = React.useState<PlanForm>(() => formFrom(plan, base?.id));
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (target == null) return;
    setForm(formFrom(plan, base?.id));
    setShowErrors(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const derived = form.parentId !== "";
  const adjRules = form.adjustmentType === "percent" ? RULES.percent : RULES.amount;
  // Родитель — любой другой план, кроме самого себя и своих «детей» (иначе цикл).
  const parentOptions = plans.filter((p) => p.id !== plan?.id && p.parentId !== plan?.id);

  const handleSave = async () => {
    const invalid = hasFieldErrors([
      [form.name, RULES.name],
      [form.code, RULES.code],
      [derived ? form.adjustmentValue : "0", adjRules],
      [form.minNights, RULES.minNights],
      [form.prepayment, RULES.prepayment],
      [form.cancellationPolicy, RULES.text],
      [form.includedServices, RULES.text],
    ]);
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    const common = {
      name: form.name.trim(),
      code: form.code.trim(),
      mealPlan: form.mealPlan,
      minNights: Number(form.minNights),
      prepaymentPercent: String(Number(form.prepayment)),
      roomTypeIds: form.roomTypeIds,
      cancellationPolicy: form.cancellationPolicy.trim(),
      includedServices: form.includedServices.trim(),
      adjustmentType: form.adjustmentType,
      adjustmentValue: derived ? String(Number(form.adjustmentValue)) : "0",
    };
    try {
      if (plan) {
        await updateRatePlan(plan.id, {
          ...common,
          ...(plan.isBase ? {} : { isActive: form.isActive }),
          ...(derived ? { parentId: form.parentId as number } : plan.parentId != null ? { clearParent: true } : {}),
        });
      } else {
        await createRatePlan({ propertyId, ...common, parentId: derived ? (form.parentId as number) : null });
      }
      void queryClient.invalidateQueries({ queryKey: ["hotel", "ratePlans"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "priceCalendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingHistory"] });
      enqueueSnackbar(plan ? "Тариф сохранён" : `Тариф «${common.name}» добавлен`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить тариф"));
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (id: number) =>
    set("roomTypeIds", form.roomTypeIds.includes(id) ? form.roomTypeIds.filter((x) => x !== id) : [...form.roomTypeIds, id]);

  return (
    <Drawer
      anchor="right"
      open={target != null}
      onClose={() => !saving && onClose()}
      PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}
    >
      <DrawerHeader
        title={plan ? plan.name : "Новый тариф"}
        subtitle={plan?.isBase ? "Основной тариф — цены категорий" : "Скидка или наценка от другого тарифа"}
        onClose={() => !saving && onClose()}
      />
      <Box sx={{ px: 3, py: 3, flex: 1, overflowY: "auto" }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}
          <DrawerSection label="Тариф" first>
            <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
              <FormField
                icon={<LocalOfferOutlined />}
                label="Название"
                placeholder="Невозвратный"
                value={form.name}
                onValueChange={(v) => set("name", v)}
                rules={RULES.name}
                showErrors={showErrors}
                disabled={saving}
                autoFocus={!plan}
                sx={{ flex: 2 }}
              />
              <FormField
                icon={<TagOutlined />}
                label="Код"
                placeholder="NR"
                value={form.code}
                onValueChange={(v) => set("code", v.toUpperCase())}
                rules={RULES.code}
                showErrors={showErrors}
                disabled={saving}
                helperText="Для каналов продаж"
                sx={{ flex: 1 }}
              />
            </Stack>
          </DrawerSection>

          {!plan?.isBase && (
            <DrawerSection label="Цена">
              <TextField
                select
                label="Считать от"
                value={form.parentId}
                onChange={(e) => set("parentId", e.target.value === "" ? "" : Number(e.target.value))}
                disabled={saving}
                slotProps={{ input: { startAdornment: <FieldIcon icon={<AccountTreeOutlined />} /> } }}
                fullWidth
              >
                <MenuItem value="">Цен категорий (как основной)</MenuItem>
                {parentOptions.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    Тарифа «{p.name}»
                  </MenuItem>
                ))}
              </TextField>
              {derived && (
                <Stack direction="row" gap={1.5} alignItems="flex-start">
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={form.adjustmentType}
                    onChange={(_, v: PlanForm["adjustmentType"] | null) => v && set("adjustmentType", v)}
                    disabled={saving}
                    sx={{ mt: 0.75, "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, px: 1.5 } }}
                  >
                    <ToggleButton value="percent">%</ToggleButton>
                    <ToggleButton value="amount">сом</ToggleButton>
                  </ToggleButtonGroup>
                  <FormField
                    icon={<PercentOutlined />}
                    label={form.adjustmentType === "percent" ? "Скидка или наценка, %" : "Скидка или наценка за ночь"}
                    unit={form.adjustmentType === "percent" ? "%" : "сом"}
                    value={form.adjustmentValue}
                    onValueChange={(v) => set("adjustmentValue", v)}
                    rules={adjRules}
                    showErrors={showErrors}
                    disabled={saving}
                    helperText="Минус — скидка: −10 значит на 10% дешевле"
                    sx={{ flex: 1 }}
                  />
                </Stack>
              )}
            </DrawerSection>
          )}

          <DrawerSection label="Условия">
            <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
              <TextField
                select
                label="Питание"
                value={form.mealPlan}
                onChange={(e) => set("mealPlan", e.target.value)}
                disabled={saving}
                slotProps={{ input: { startAdornment: <FieldIcon icon={<RestaurantOutlined />} /> } }}
                sx={{ flex: 1 }}
              >
                {MEAL_PLANS.map((m) => (
                  <MenuItem key={m} value={m}>
                    {HOTEL_BOARD_TYPE_LABELS[m]}
                  </MenuItem>
                ))}
              </TextField>
              <FormField
                icon={<NightsStayOutlined />}
                label="Минимум ночей"
                value={form.minNights}
                onValueChange={(v) => set("minNights", v)}
                rules={RULES.minNights}
                showErrors={showErrors}
                disabled={saving}
                sx={{ flex: 1 }}
              />
              <FormField
                icon={<PercentOutlined />}
                label="Предоплата"
                unit="%"
                value={form.prepayment}
                onValueChange={(v) => set("prepayment", v)}
                rules={RULES.prepayment}
                showErrors={showErrors}
                disabled={saving}
                sx={{ flex: 1 }}
              />
            </Stack>
            <FormField
              icon={<NotesOutlined />}
              label="Условия отмены"
              placeholder="Бесплатно за 3 дня до заезда, позже — стоимость первой ночи"
              value={form.cancellationPolicy}
              onValueChange={(v) => set("cancellationPolicy", v)}
              rules={RULES.text}
              showErrors={showErrors}
              disabled={saving}
              multiline
              minRows={2}
              fullWidth
            />
            <FormField
              icon={<NotesOutlined />}
              label="Что входит"
              placeholder="Завтрак, парковка, поздний выезд до 14:00"
              value={form.includedServices}
              onValueChange={(v) => set("includedServices", v)}
              rules={RULES.text}
              showErrors={showErrors}
              disabled={saving}
              multiline
              minRows={2}
              fullWidth
            />
          </DrawerSection>

          <DrawerSection label="Для каких категорий">
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              <Chip
                label="Все категории"
                color={form.roomTypeIds.length === 0 ? "primary" : "default"}
                variant={form.roomTypeIds.length === 0 ? "filled" : "outlined"}
                onClick={() => set("roomTypeIds", [])}
                disabled={saving}
              />
              {roomTypes.map((t) => {
                const on = form.roomTypeIds.includes(t.id);
                return (
                  <Chip key={t.id} label={t.name} color={on ? "primary" : "default"} variant={on ? "filled" : "outlined"} onClick={() => toggleType(t.id)} disabled={saving} />
                );
              })}
            </Stack>
          </DrawerSection>

          {plan && !plan.isBase && (
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} disabled={saving} />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Продаётся
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Выключенный тариф не предлагается в новых бронях; проданные по нему остаются
                  </Typography>
                </Box>
              }
            />
          )}
        </Stack>
      </Box>
      <DrawerFooter>
        <Button onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation onClick={() => void handleSave()} disabled={saving} sx={{ px: 3, borderRadius: "10px", fontWeight: 700 }}>
          {saving ? "Сохраняем…" : plan ? "Сохранить" : "Добавить тариф"}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
};

export default HotelRatePlansPage;
