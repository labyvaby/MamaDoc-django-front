import React from "react";
import {
  alpha,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Close from "@mui/icons-material/CloseOutlined";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import BedtimeOutlined from "@mui/icons-material/BedtimeOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

import type { Service } from "../../../api/catalog";
import type { DjangoProduct } from "../../../api/warehouse";
import { subtleBg } from "../../../theme/uiHelpers";

// ── value shape ─────────────────────────────────────────────────────────────
// Mirrors the Django EmployeeRule contract (see api/payroll.ts).

export type SalaryRuleRow = {
  id: string;
  serviceIds: number[];
  percent: string;
  fixedAmount: string;
};

/** Сентинел «Все товары» в `productIds` — маппится на общие поля правила
 *  (product_percent / product_fixed_amount), а не на ставки по товарам. */
export const ALL_PRODUCTS = -1;

export type SalaryProductRuleRow = {
  id: string;
  /** ID товаров; может содержать сентинел ALL_PRODUCTS («Все товары»). */
  productIds: number[];
  percent: string;
  fixedAmount: string;
};

export type SalarySettingsValue = {
  /** Фикс-ставки (день/ночь/приём) включены. */
  enabled: boolean;
  nightRate: string;
  dayRate: string;
  appointmentRate: string;
  rules: SalaryRuleRow[];
  /** «Товары в приёмах» включены. */
  productEnabled: boolean;
  /** Правила по товарам; правило с ALL_PRODUCTS действует на все товары
   *  (кроме тех, у кого есть отдельное правило). */
  productRules: SalaryProductRuleRow[];
};

export const EMPTY_SALARY: SalarySettingsValue = {
  enabled: false,
  nightRate: "",
  dayRate: "",
  appointmentRate: "",
  rules: [],
  productEnabled: false,
  productRules: [],
};

type Props = {
  value: SalarySettingsValue;
  onChange: (v: SalarySettingsValue) => void;
  services: Service[];
  loadingServices?: boolean;
  /** Подсказка над «Ставками по услугам» (напр., у врача нет закреплённых услуг). */
  servicesHint?: string;
  products?: DjangoProduct[];
  loadingProducts?: boolean;
  disabled?: boolean;
};

let _ruleSeq = 0;
const newRuleId = () => `rule_${(_ruleSeq += 1)}`;

const num = (s: string) => parseFloat(s) || 0;

// ── маленькие строительные блоки ─────────────────────────────────────────────

/** Числовое поле с кастомными степперами ▲/▼ (нативные спиннеры скрыты). */
const NumberField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
}> = ({ value, onChange, unit, step = 1, disabled, placeholder = "0" }) => {
  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, (parseFloat(value) || 0) + dir * step);
    // Убираем хвосты плавающей точки (0.1+0.2), но не трогаем целые.
    onChange(String(Number(next.toFixed(2))));
  };
  return (
    <Stack
      direction="row"
      sx={(t) => ({
        alignItems: "stretch",
        height: 40,
        border: 1,
        borderColor: "divider",
        borderRadius: "9px",
        bgcolor: "background.paper",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        "&:focus-within": {
          borderColor: "primary.main",
          boxShadow: `0 0 0 3px ${alpha(t.palette.primary.main, 0.14)}`,
        },
      })}
    >
      <Stack direction="row" alignItems="center" gap={0.5} sx={{ flex: 1, minWidth: 0, pl: 1.25, pr: 0.5 }}>
        <Box
          component="input"
          type="number"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          sx={{
            all: "unset",
            width: "100%",
            minWidth: 0,
            font: "inherit",
            fontSize: "0.9rem",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: "text.primary",
            "&::placeholder": { color: "text.disabled", fontWeight: 400 },
            "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
              WebkitAppearance: "none",
              margin: 0,
            },
            MozAppearance: "textfield",
          }}
        />
        {unit && (
          <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: "nowrap" }}>
            {unit}
          </Typography>
        )}
      </Stack>
      <Stack sx={{ width: 24, flexShrink: 0, borderLeft: 1, borderColor: "divider" }}>
        <ButtonBase
          tabIndex={-1}
          disabled={disabled}
          onClick={() => bump(1)}
          sx={(t) => ({
            flex: 1,
            color: "text.disabled",
            borderBottom: 1,
            borderColor: "divider",
            "&:hover": { color: "primary.onSurface", bgcolor: alpha(t.palette.primary.main, 0.1) },
          })}
        >
          <KeyboardArrowUp sx={{ fontSize: 13 }} />
        </ButtonBase>
        <ButtonBase
          tabIndex={-1}
          disabled={disabled}
          onClick={() => bump(-1)}
          sx={(t) => ({
            flex: 1,
            color: "text.disabled",
            "&:hover": { color: "primary.onSurface", bgcolor: alpha(t.palette.primary.main, 0.1) },
          })}
        >
          <KeyboardArrowDown sx={{ fontSize: 13 }} />
        </ButtonBase>
      </Stack>
    </Stack>
  );
};

/** Заголовок секции: иконка-плашка + название/подпись + опц. тумблер. */
const SalarySection: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  toggle?: { checked: boolean; onChange: () => void; disabled?: boolean };
}> = ({ icon, title, subtitle, toggle }) => (
  <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1.5 }}>
    <Box
      sx={(t) => ({
        width: 34,
        height: 34,
        borderRadius: "9px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "primary.onSurface",
        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
        "& .MuiSvgIcon-root": { fontSize: 18 },
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography variant="body2" fontWeight={600}>{title}</Typography>
      <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
    </Box>
    {toggle && (
      <Switch
        size="small"
        color="primary"
        checked={toggle.checked}
        onChange={toggle.onChange}
        disabled={toggle.disabled}
      />
    )}
  </Stack>
);

/** Акцентный фрагмент «формулы». */
const Hl: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box component="span" sx={{ color: "primary.onSurface", fontWeight: 600 }}>
    {children}
  </Box>
);

const DjangoSalarySettings: React.FC<Props> = ({
  value,
  onChange,
  services,
  loadingServices = false,
  servicesHint,
  products = [],
  loadingProducts = false,
  disabled = false,
}) => {
  const patch = (p: Partial<SalarySettingsValue>) => onChange({ ...value, ...p });

  const addRule = () =>
    patch({
      rules: [
        ...value.rules,
        { id: newRuleId(), serviceIds: [], percent: "", fixedAmount: "" },
      ],
    });

  const removeRule = (id: string) =>
    patch({ rules: value.rules.filter((r) => r.id !== id) });

  const patchRule = (id: string, p: Partial<SalaryRuleRow>) =>
    patch({ rules: value.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  const addProductRule = () =>
    patch({
      productRules: [
        ...value.productRules,
        { id: newRuleId(), productIds: [], percent: "", fixedAmount: "" },
      ],
    });

  /** Тумблер секции товаров: при включении сразу даём первое правило. */
  const toggleProducts = () => {
    const next = !value.productEnabled;
    patch({
      productEnabled: next,
      productRules:
        next && value.productRules.length === 0
          ? [{ id: newRuleId(), productIds: [], percent: "", fixedAmount: "" }]
          : value.productRules,
    });
  };

  const removeProductRule = (id: string) =>
    patch({ productRules: value.productRules.filter((r) => r.id !== id) });

  const patchProductRule = (id: string, p: Partial<SalaryProductRuleRow>) =>
    patch({
      productRules: value.productRules.map((r) =>
        r.id === id ? { ...r, ...p } : r,
      ),
    });

  const serviceName = (id: number) =>
    services.find((s) => s.id === id)?.name ?? `#${id}`;

  const productName = (id: number) =>
    id === ALL_PRODUCTS
      ? "Все товары"
      : products.find((p) => p.id === id)?.name ?? `#${id}`;

  const ruleFormula = (rule: SalaryRuleRow): React.ReactNode => {
    if (rule.serviceIds.length === 0) {
      return "Выберите услуги, к которым применяется правило";
    }
    const p = num(rule.percent);
    const f = num(rule.fixedAmount);
    if (!p && !f) return "Укажите процент и/или фикс — правило пока ничего не начисляет";
    return (
      <>
        Сотрудник получает{" "}
        {p > 0 && <><Hl>{p}%</Hl> от суммы</>}
        {p > 0 && f > 0 && " + "}
        {f > 0 && <><Hl>{f} с</Hl> фикс</>}
        {" за: "}
        <Hl>{rule.serviceIds.map(serviceName).join(", ")}</Hl>
      </>
    );
  };

  const productRuleFormula = (rule: SalaryProductRuleRow): React.ReactNode => {
    if (rule.productIds.length === 0) {
      return "Выберите товары, к которым применяется правило";
    }
    const isAll = rule.productIds.includes(ALL_PRODUCTS);
    const hasOtherRules = value.productRules.some(
      (r) => r.id !== rule.id && r.productIds.length > 0,
    );
    const p = num(rule.percent);
    const f = num(rule.fixedAmount);
    if (!p && !f) return "Укажите процент и/или бонус — правило пока ничего не начисляет";
    return (
      <>
        Сотрудник получает{" "}
        {p > 0 && <><Hl>{p}%</Hl> от суммы</>}
        {p > 0 && f > 0 && " + "}
        {f > 0 && <><Hl>{f} с</Hl> за единицу</>}
        {" за "}
        {isAll ? (
          <>
            <Hl>все товары</Hl>, проданные в его приёмах
            {hasOtherRules && " (кроме товаров с отдельным правилом)"}
          </>
        ) : (
          <>: <Hl>{rule.productIds.map(productName).join(", ")}</Hl></>
        )}
      </>
    );
  };

  const cardSx = (t: any) => ({
    p: 1.5,
    border: 1,
    borderColor: "divider",
    borderRadius: "12px",
    bgcolor: subtleBg(t),
  });

  return (
    <Stack spacing={2.5} sx={{ width: "100%", mt: 0.5 }}>
      {/* ── 1. Почасовая и приёмы ── */}
      <Box>
        <SalarySection
          icon={<AccessTimeOutlined />}
          title="Почасовая и приёмы"
          subtitle="Фикс-ставки за час работы и за приём"
          toggle={{
            checked: value.enabled,
            onChange: () => patch({ enabled: !value.enabled }),
            disabled,
          }}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
            gap: 1.25,
            opacity: value.enabled ? 1 : 0.4,
            pointerEvents: value.enabled && !disabled ? "auto" : "none",
            transition: "opacity .2s ease",
          }}
        >
          {(
            [
              { key: "dayRate", label: "День", unit: "с/час", icon: <WbSunnyOutlined /> },
              { key: "nightRate", label: "Ночь", unit: "с/час", icon: <BedtimeOutlined /> },
              { key: "appointmentRate", label: "Приём", unit: "с/приём", icon: <MedicalServicesOutlined /> },
            ] as const
          ).map((f) => (
            <Box key={f.key} sx={cardSx}>
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1, color: "text.secondary" }}>
                <Box sx={{ display: "flex", "& .MuiSvgIcon-root": { fontSize: 15 } }}>{f.icon}</Box>
                <Typography variant="caption" fontWeight={500}>{f.label}</Typography>
              </Stack>
              <NumberField
                value={value[f.key] || ""}
                onChange={(v) => patch({ [f.key]: v } as Partial<SalarySettingsValue>)}
                unit={f.unit}
                step={50}
                disabled={disabled || !value.enabled}
              />
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── 2. Ставки по услугам ── */}
      <Box>
        <SalarySection
          icon={<LocalOfferOutlined />}
          title="Ставки по услугам"
          subtitle="% и фикс за конкретные услуги"
        />

        {servicesHint && (
          <Box
            sx={(t) => ({
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              p: 1.5,
              mb: 1.5,
              fontSize: "0.8rem",
              lineHeight: 1.4,
              color: "text.secondary",
              border: 1,
              borderColor: "divider",
              borderRadius: "12px",
              bgcolor: subtleBg(t),
            })}
          >
            <InfoOutlined sx={{ fontSize: 18, mt: "1px", color: "text.disabled", flexShrink: 0 }} />
            <span>{servicesHint}</span>
          </Box>
        )}

        <Stack spacing={1.5}>
          {value.rules.length === 0 && (
            <Box
              sx={{
                p: 2.5,
                textAlign: "center",
                color: "text.disabled",
                fontSize: "0.8rem",
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: "12px",
              }}
            >
              Правил по услугам пока нет
            </Box>
          )}

          {value.rules.map((rule, idx) => (
            <Box key={rule.id} sx={cardSx}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Typography variant="caption" fontWeight={600} color="text.disabled">
                  Правило {idx + 1}
                </Typography>
                <IconButton
                  size="small"
                  disabled={disabled}
                  onClick={() => removeRule(rule.id)}
                  sx={(t) => ({
                    border: 1,
                    borderColor: "divider",
                    borderRadius: "8px",
                    color: "text.disabled",
                    "&:hover": {
                      color: t.palette.error.main,
                      borderColor: alpha(t.palette.error.main, 0.4),
                      bgcolor: alpha(t.palette.error.main, 0.1),
                    },
                  })}
                >
                  <DeleteOutline sx={{ fontSize: 15 }} />
                </IconButton>
              </Stack>

              {/* выбор услуг */}
              <FormControl fullWidth size="small" sx={{ mb: 1.25 }}>
                <Select<number[]>
                  multiple
                  displayEmpty
                  value={rule.serviceIds}
                  disabled={disabled}
                  onChange={(e) =>
                    patchRule(rule.id, {
                      serviceIds: (e.target.value as number[]).map(Number),
                    })
                  }
                  renderValue={(selected) =>
                    selected.length === 0 ? (
                      <Typography variant="body2" color="text.disabled">
                        Выберите услуги…
                      </Typography>
                    ) : (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {selected.map((id) => (
                          <Chip
                            key={id}
                            label={serviceName(id)}
                            size="small"
                            onDelete={() =>
                              patchRule(rule.id, {
                                serviceIds: rule.serviceIds.filter((x) => x !== id),
                              })
                            }
                            deleteIcon={
                              <Close
                                sx={{ fontSize: "12px !important" }}
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            }
                            sx={(t) => ({
                              height: 22,
                              fontSize: "0.7rem",
                              fontWeight: 500,
                              borderRadius: "7px",
                              color: "primary.onSurface",
                              bgcolor: alpha(
                                t.palette.primary.main,
                                t.palette.mode === "dark" ? 0.18 : 0.1,
                              ),
                            })}
                          />
                        ))}
                      </Box>
                    )
                  }
                  sx={{
                    borderRadius: "10px",
                    bgcolor: "background.paper",
                    "& .MuiSelect-select": {
                      py: 1,
                      px: 1.25,
                      whiteSpace: "normal",
                      minHeight: "0 !important",
                    },
                  }}
                >
                  {loadingServices ? (
                    <MenuItem disabled sx={{ justifyContent: "center", py: 1 }}>
                      <CircularProgress size={18} />
                    </MenuItem>
                  ) : (
                    services.map((service) => (
                      <MenuItem key={service.id} value={service.id} sx={{ py: 0.5, minHeight: 0 }}>
                        <Checkbox
                          checked={rule.serviceIds.indexOf(service.id) > -1}
                          size="small"
                          sx={{ p: 0.5 }}
                        />
                        <ListItemText
                          primary={service.name}
                          primaryTypographyProps={{ variant: "body2" }}
                        />
                        {service.basePrice && Number(service.basePrice) > 0 && (
                          <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                            {Number(service.basePrice).toLocaleString("ru-RU")} с
                          </Typography>
                        )}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>

              {/* % + фикс */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Процент
                  </Typography>
                  <NumberField
                    value={rule.percent || ""}
                    onChange={(v) => patchRule(rule.id, { percent: v })}
                    unit="%"
                    step={1}
                    disabled={disabled}
                  />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Фиксировано
                  </Typography>
                  <NumberField
                    value={rule.fixedAmount || ""}
                    onChange={(v) => patchRule(rule.id, { fixedAmount: v })}
                    unit="с"
                    step={50}
                    disabled={disabled}
                  />
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25, lineHeight: 1.5 }}>
                {ruleFormula(rule)}
              </Typography>
            </Box>
          ))}

          <Button
            variant="text"
            size="small"
            startIcon={<Add sx={{ fontSize: 16 }} />}
            onClick={addRule}
            disabled={disabled}
            sx={(t) => ({
              border: "1.5px dashed",
              borderColor: "divider",
              borderRadius: "12px",
              color: "primary.onSurface",
              py: 1.1,
              fontWeight: 500,
              "&:hover": {
                borderColor: alpha(t.palette.primary.main, 0.5),
                bgcolor: alpha(t.palette.primary.main, 0.06),
              },
            })}
          >
            Добавить правило
          </Button>
        </Stack>
      </Box>

      {/* ── 3. Товары в приёмах ── */}
      <Box>
        <SalarySection
          icon={<ShoppingBagOutlined />}
          title="Товары в приёмах"
          subtitle="% или бонус с проданных на приёме товаров"
          toggle={{
            checked: value.productEnabled,
            onChange: toggleProducts,
            disabled,
          }}
        />

        {/* Правила по товарам: «Все товары» — общие поля, конкретные — свои ставки */}
        <Stack
          spacing={1.5}
          sx={{
            opacity: value.productEnabled ? 1 : 0.4,
            pointerEvents: value.productEnabled && !disabled ? "auto" : "none",
            transition: "opacity .2s ease",
          }}
        >
          {value.productRules.length === 0 && (
            <Box
              sx={{
                p: 2.5,
                textAlign: "center",
                color: "text.disabled",
                fontSize: "0.8rem",
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: "12px",
              }}
            >
              Правил по товарам пока нет
            </Box>
          )}

          {value.productRules.map((rule, idx) => (
            <Box key={rule.id} sx={cardSx}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Typography variant="caption" fontWeight={600} color="text.disabled">
                  Правило по товарам {idx + 1}
                </Typography>
                <IconButton
                  size="small"
                  disabled={disabled}
                  onClick={() => removeProductRule(rule.id)}
                  sx={(t) => ({
                    border: 1,
                    borderColor: "divider",
                    borderRadius: "8px",
                    color: "text.disabled",
                    "&:hover": {
                      color: t.palette.error.main,
                      borderColor: alpha(t.palette.error.main, 0.4),
                      bgcolor: alpha(t.palette.error.main, 0.1),
                    },
                  })}
                >
                  <DeleteOutline sx={{ fontSize: 15 }} />
                </IconButton>
              </Stack>

              {/* выбор товаров: «Все товары» взаимоисключим с конкретными */}
              <FormControl fullWidth size="small" sx={{ mb: 1.25 }}>
                <Select<number[]>
                  multiple
                  displayEmpty
                  value={rule.productIds}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = (e.target.value as number[]).map(Number);
                    const hadAll = rule.productIds.includes(ALL_PRODUCTS);
                    const hasAll = next.includes(ALL_PRODUCTS);
                    patchProductRule(rule.id, {
                      productIds:
                        hasAll && !hadAll
                          ? [ALL_PRODUCTS] // только что выбрали «Все товары» — сбрасываем конкретные
                          : next.filter((x) => x !== ALL_PRODUCTS || next.length === 1),
                    });
                  }}
                  renderValue={(selected) =>
                    selected.length === 0 ? (
                      <Typography variant="body2" color="text.disabled">
                        Выберите товары…
                      </Typography>
                    ) : (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {selected.map((id) => (
                          <Chip
                            key={id}
                            label={productName(id)}
                            size="small"
                            onDelete={() =>
                              patchProductRule(rule.id, {
                                productIds: rule.productIds.filter((x) => x !== id),
                              })
                            }
                            deleteIcon={
                              <Close
                                sx={{ fontSize: "12px !important" }}
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            }
                            sx={(t) => ({
                              height: 22,
                              fontSize: "0.7rem",
                              fontWeight: 500,
                              borderRadius: "7px",
                              color: "primary.onSurface",
                              bgcolor: alpha(
                                t.palette.primary.main,
                                t.palette.mode === "dark" ? 0.18 : 0.1,
                              ),
                            })}
                          />
                        ))}
                      </Box>
                    )
                  }
                  sx={{
                    borderRadius: "10px",
                    bgcolor: "background.paper",
                    "& .MuiSelect-select": {
                      py: 1,
                      px: 1.25,
                      whiteSpace: "normal",
                      minHeight: "0 !important",
                    },
                  }}
                >
                  {(() => {
                    const allTakenElsewhere = value.productRules.some(
                      (r) => r.id !== rule.id && r.productIds.includes(ALL_PRODUCTS),
                    );
                    return [
                      <MenuItem
                        key={ALL_PRODUCTS}
                        value={ALL_PRODUCTS}
                        disabled={allTakenElsewhere}
                        sx={{ py: 0.5, minHeight: 0, borderBottom: 1, borderColor: "divider", mb: 0.5 }}
                      >
                        <Checkbox
                          checked={rule.productIds.includes(ALL_PRODUCTS)}
                          size="small"
                          sx={{ p: 0.5 }}
                        />
                        <ListItemText
                          primary="Все товары"
                          secondary={
                            allTakenElsewhere
                              ? "Уже используется в другом правиле"
                              : "Кроме товаров с отдельным правилом"
                          }
                          primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                          secondaryTypographyProps={{ variant: "caption" }}
                        />
                      </MenuItem>,
                      ...(loadingProducts
                        ? [
                            <MenuItem key="loading" disabled sx={{ justifyContent: "center", py: 1 }}>
                              <CircularProgress size={18} />
                            </MenuItem>,
                          ]
                        : products.length === 0
                        ? [
                            <MenuItem key="empty" disabled sx={{ py: 1 }}>
                              <Typography variant="body2" color="text.disabled">
                                Товары недоступны
                              </Typography>
                            </MenuItem>,
                          ]
                        : products.map((product) => (
                            <MenuItem key={product.id} value={product.id} sx={{ py: 0.5, minHeight: 0 }}>
                              <Checkbox
                                checked={rule.productIds.indexOf(product.id) > -1}
                                size="small"
                                sx={{ p: 0.5 }}
                              />
                              <ListItemText
                                primary={product.name}
                                primaryTypographyProps={{ variant: "body2" }}
                              />
                              {product.price > 0 && (
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                                  {product.price.toLocaleString("ru-RU")} с
                                </Typography>
                              )}
                            </MenuItem>
                          ))),
                    ];
                  })()}
                </Select>
              </FormControl>

              {/* % + бонус */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Процент
                  </Typography>
                  <NumberField
                    value={rule.percent || ""}
                    onChange={(v) => patchProductRule(rule.id, { percent: v })}
                    unit="%"
                    step={1}
                    disabled={disabled}
                  />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Бонус за единицу
                  </Typography>
                  <NumberField
                    value={rule.fixedAmount || ""}
                    onChange={(v) => patchProductRule(rule.id, { fixedAmount: v })}
                    unit="с"
                    step={50}
                    disabled={disabled}
                  />
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25, lineHeight: 1.5 }}>
                {productRuleFormula(rule)}
              </Typography>
            </Box>
          ))}

          <Button
            variant="text"
            size="small"
            startIcon={<Add sx={{ fontSize: 16 }} />}
            onClick={addProductRule}
            disabled={disabled}
            sx={(t) => ({
              border: "1.5px dashed",
              borderColor: "divider",
              borderRadius: "12px",
              color: "primary.onSurface",
              py: 1.1,
              fontWeight: 500,
              "&:hover": {
                borderColor: alpha(t.palette.primary.main, 0.5),
                bgcolor: alpha(t.palette.primary.main, 0.06),
              },
            })}
          >
            Добавить правило по товарам
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
};

// ── mapping helpers (Django EmployeeRule ⇄ form value) ──────────────────────

export function ruleToSalaryValue(rule: {
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  productPercent?: string;
  productFixedAmount?: string;
  serviceRates: { serviceId: number; percent: string; fixedAmount: string }[];
  productRates?: { productId: number; percent: string; fixedAmount: string }[];
}): SalarySettingsValue {
  const enabled =
    num(rule.appointmentRate) > 0 || num(rule.dayHourlyRate) > 0 || num(rule.nightHourlyRate) > 0;
  const productPercent = rule.productPercent ?? "";
  const productBonus = rule.productFixedAmount ?? "";
  const hasGeneralProduct = num(productPercent) > 0 || num(productBonus) > 0;

  // Group flat per-service rates back into rows by identical (percent, fixed).
  const groups = new Map<string, SalaryRuleRow>();
  for (const r of rule.serviceRates) {
    const key = `${r.percent}|${r.fixedAmount}`;
    const existing = groups.get(key);
    if (existing) {
      existing.serviceIds.push(r.serviceId);
    } else {
      groups.set(key, {
        id: newRuleId(),
        serviceIds: [r.serviceId],
        percent: r.percent,
        fixedAmount: r.fixedAmount,
      });
    }
  }

  // Same grouping for per-product rates.
  const productGroups = new Map<string, SalaryProductRuleRow>();
  for (const r of rule.productRates ?? []) {
    const key = `${r.percent}|${r.fixedAmount}`;
    const existing = productGroups.get(key);
    if (existing) {
      existing.productIds.push(r.productId);
    } else {
      productGroups.set(key, {
        id: newRuleId(),
        productIds: [r.productId],
        percent: r.percent,
        fixedAmount: r.fixedAmount,
      });
    }
  }

  // Общие поля правила → строка «Все товары» (первой в списке).
  const productRules: SalaryProductRuleRow[] = [
    ...(hasGeneralProduct
      ? [{
          id: newRuleId(),
          productIds: [ALL_PRODUCTS],
          percent: productPercent,
          fixedAmount: productBonus,
        }]
      : []),
    ...productGroups.values(),
  ];

  return {
    enabled,
    nightRate: rule.nightHourlyRate ?? "",
    dayRate: rule.dayHourlyRate ?? "",
    appointmentRate: rule.appointmentRate ?? "",
    rules: [...groups.values()],
    productEnabled: productRules.length > 0,
    productRules,
  };
}

export function salaryValueToPayload(value: SalarySettingsValue): {
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  productPercent: string;
  productFixedAmount: string;
  isActive: boolean;
  serviceRates: { serviceId: number; percent: string; fixedAmount: string }[];
  productRates: { productId: number; percent: string; fixedAmount: string }[];
} {
  const rate = (s: string) => (s.trim() ? s.trim() : "0");
  const serviceRates = value.rules.flatMap((r) =>
    r.serviceIds.map((serviceId) => ({
      serviceId,
      percent: rate(r.percent),
      fixedAmount: rate(r.fixedAmount),
    })),
  );
  // Правило «Все товары» → общие поля; остальные → ставки по товарам.
  const effectiveRules = value.productEnabled ? value.productRules : [];
  const allRule = effectiveRules.find((r) => r.productIds.includes(ALL_PRODUCTS));
  const productRates = effectiveRules.flatMap((r) =>
    r.productIds
      .filter((id) => id !== ALL_PRODUCTS)
      .map((productId) => ({
        productId,
        percent: rate(r.percent),
        fixedAmount: rate(r.fixedAmount),
      })),
  );
  return {
    appointmentRate: value.enabled ? rate(value.appointmentRate) : "0",
    dayHourlyRate: value.enabled ? rate(value.dayRate) : "0",
    nightHourlyRate: value.enabled ? rate(value.nightRate) : "0",
    productPercent: allRule ? rate(allRule.percent) : "0",
    productFixedAmount: allRule ? rate(allRule.fixedAmount) : "0",
    isActive: true,
    serviceRates,
    productRates,
  };
}

export default DjangoSalarySettings;
