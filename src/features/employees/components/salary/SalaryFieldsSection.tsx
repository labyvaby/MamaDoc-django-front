import React from "react";
import { alpha, Box, Stack, Tooltip, Typography } from "@mui/material";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import { motion } from "framer-motion";

import type { SalaryCardField } from "../../../../api/payroll";
import { AppButton } from "../../../../components/ui";
import { subtleBg } from "../../../../theme/uiHelpers";
import { NumberField, SalarySection } from "../DjangoSalarySettings";
import { toNumber } from "./salaryCardModel";

type Props = {
  fields: SalaryCardField[];
  values: Record<number, string>;
  onChange: (fieldId: number, value: string) => void;
  /** Своя карточка по view_own или сохранение идёт — всё только на чтение. */
  readOnly?: boolean;
  canManage?: boolean;
  onManage?: () => void;
};

const kindText = (field: SalaryCardField) =>
  `${field.kind === "accrual" ? "Начисление" : "Удержание"} · ${
    field.valueType === "amount"
      ? "сумма в месяц"
      : field.kind === "accrual"
        ? "% от заработанного по ставкам"
        : "% от всего начисленного"
  }`;

/** Надбавки и удержания, которые организация завела сама; видимость — по ролям. */
const SalaryFieldsSection: React.FC<Props> = ({
  fields,
  values,
  onChange,
  readOnly = false,
  canManage = false,
  onManage,
}) => (
  <Stack spacing={2}>
    <Stack direction="row" alignItems="flex-start" gap={1}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SalarySection
          icon={<TuneOutlined />}
          title="Свои поля"
          subtitle="Надбавки и удержания организации — кто их видит и меняет, решают роли"
        />
      </Box>
      {canManage && onManage && (
        <AppButton
          size="small"
          variant="outlined"
          startIcon={<SettingsOutlined fontSize="small" />}
          onClick={onManage}
          sx={{ flexShrink: 0 }}
        >
          Настроить поля
        </AppButton>
      )}
    </Stack>

    {fields.length === 0 ? (
      <Box
        sx={(t) => ({
          p: 3,
          textAlign: "center",
          borderRadius: "14px",
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: subtleBg(t),
        })}
      >
        <AutoAwesomeOutlined sx={{ fontSize: 28, color: "primary.onSurface", mb: 1 }} />
        <Typography variant="body2" fontWeight={600}>
          {canManage ? "Полей пока нет" : "Вам не открыто ни одно поле"}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {canManage
            ? "Например: «Надбавка за стаж», «Оклад», «Удержание за форму». Создайте поле — и задайте сумму каждому сотруднику."
            : "Поля и доступ к ним настраивает управляющий."}
        </Typography>
        {canManage && onManage && (
          <AppButton size="small" variant="contained" onClick={onManage} sx={{ mt: 1.5 }}>
            Создать поле
          </AppButton>
        )}
      </Box>
    ) : (
      <Stack spacing={1.25}>
        {fields.map((field, index) => {
          const accrual = field.kind === "accrual";
          const editable = field.canEdit && !readOnly;
          const value = values[field.id] ?? "";
          return (
            <Box
              key={field.id}
              component={motion.div}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              sx={(t) => ({
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.25,
                pl: 1.5,
                borderRadius: "14px",
                border: 1,
                borderColor: "divider",
                bgcolor: subtleBg(t),
                flexWrap: { xs: "wrap", md: "nowrap" },
              })}
            >
              <Box
                sx={(t) => {
                  const tone = accrual ? t.palette.success.main : t.palette.error.main;
                  return {
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: tone,
                    bgcolor: alpha(tone, t.palette.mode === "dark" ? 0.18 : 0.1),
                    "& .MuiSvgIcon-root": { fontSize: 18 },
                  };
                }}
              >
                {accrual ? <TrendingUpOutlined /> : <TrendingDownOutlined />}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {field.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {kindText(field)}
                </Typography>
              </Box>
              {editable ? (
                <Box sx={{ width: { xs: "100%", md: 170 }, flexShrink: 0 }}>
                  <NumberField
                    value={value}
                    onChange={(v) => onChange(field.id, v)}
                    unit={field.valueType === "amount" ? "с/мес" : "%"}
                    step={field.valueType === "amount" ? 500 : 1}
                  />
                </Box>
              ) : (
                <Tooltip title={readOnly ? "Только просмотр" : "Менять это поле вашей роли не разрешено"}>
                  <Stack direction="row" alignItems="center" gap={0.75} sx={{ color: "text.secondary", flexShrink: 0 }}>
                    <LockOutlined sx={{ fontSize: 15 }} />
                    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums", color: "text.primary" }}>
                      {toNumber(value).toLocaleString("ru-RU")} {field.valueType === "amount" ? "с" : "%"}
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Stack>
    )}
  </Stack>
);

export default SalaryFieldsSection;
