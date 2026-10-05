import React from "react";
import {
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  IconButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Close from "@mui/icons-material/CloseOutlined";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { AnimatePresence, motion } from "framer-motion";

import { subtleBg } from "../../../../theme/uiHelpers";
import { NumberField, SalarySection } from "../DjangoSalarySettings";
import { AnimatedNumber } from "./AnimatedNumber";
import {
  ALL_PIPELINES,
  newDealRuleId,
  toNumber,
  type DealRuleRow,
  type SalaryDealsValue,
} from "./salaryCardModel";

export type DealMonthStats = {
  count: number;
  amount: number;
  pay: number;
};

type Props = {
  value: SalaryDealsValue;
  onChange: (value: SalaryDealsValue) => void;
  pipelines: { id: number; name: string }[];
  disabled?: boolean;
  /** Итоги текущего месяца из отчёта ЗП; null — отчёт недоступен. */
  monthStats?: DealMonthStats | null;
};

/** «1 сделка», «3 сделки», «5 сделок». */
const dealsWord = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "сделка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "сделки";
  return "сделок";
};

const Hl: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box component="span" sx={{ color: "primary.onSurface", fontWeight: 600 }}>
    {children}
  </Box>
);

const cardSx = (t: Parameters<typeof subtleBg>[0]) => ({
  p: 1.5,
  border: 1,
  borderColor: "divider",
  borderRadius: "12px",
  bgcolor: subtleBg(t),
});

const emptyRule = (): DealRuleRow => ({
  id: newDealRuleId(),
  pipelineIds: [],
  percent: "",
  fixedAmount: "",
});

/**
 * Комиссия за сделки воронки продаж. Устроено как правила по товарам:
 * «Все воронки» — общая ставка, правило с конкретными воронками — их ставка.
 * Платится ответственному за сделку в месяц перевода в этап «Выиграна».
 */
const SalaryDealsSection: React.FC<Props> = ({
  value,
  onChange,
  pipelines,
  disabled = false,
  monthStats,
}) => {
  const patch = (p: Partial<SalaryDealsValue>) => onChange({ ...value, ...p });
  const patchRule = (id: string, p: Partial<DealRuleRow>) =>
    patch({ rules: value.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  const toggle = () => {
    const enabled = !value.enabled;
    patch({
      enabled,
      rules:
        enabled && value.rules.length === 0
          ? [{ ...emptyRule(), pipelineIds: [ALL_PIPELINES] }]
          : value.rules,
    });
  };

  const pipelineName = (id: number) =>
    id === ALL_PIPELINES
      ? "Все воронки"
      : pipelines.find((p) => p.id === id)?.name ?? `Воронка #${id}`;

  const formula = (rule: DealRuleRow): React.ReactNode => {
    if (rule.pipelineIds.length === 0) return "Выберите воронки, к которым применяется правило";
    const p = toNumber(rule.percent);
    const f = toNumber(rule.fixedAmount);
    if (!p && !f) return "Укажите процент и/или фикс — правило пока ничего не начисляет";
    const isAll = rule.pipelineIds.includes(ALL_PIPELINES);
    const hasOthers = value.rules.some((r) => r.id !== rule.id && r.pipelineIds.length > 0);
    return (
      <>
        Сотрудник получает{" "}
        {p > 0 && <><Hl>{p}%</Hl> от суммы</>}
        {p > 0 && f > 0 && " + "}
        {f > 0 && <><Hl>{f.toLocaleString("ru-RU")} с</Hl> за сделку</>}
        {" за выигранные сделки "}
        {isAll ? (
          <>
            <Hl>всех воронок</Hl>
            {hasOthers && " (кроме воронок с отдельным правилом)"}
          </>
        ) : (
          <>воронок: <Hl>{rule.pipelineIds.map(pipelineName).join(", ")}</Hl></>
        )}
      </>
    );
  };

  return (
    <Stack spacing={2}>
      <SalarySection
        icon={<HandshakeOutlined />}
        title="Воронка продаж"
        subtitle="% и фикс за выигранные сделки, где сотрудник ответственный"
        toggle={{ checked: value.enabled, onChange: toggle, disabled }}
      />

      {monthStats && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
          }}
        >
          {(
            [
              { label: "Выиграно", value: monthStats.count, unit: dealsWord(monthStats.count) },
              { label: "На сумму", value: monthStats.amount, unit: "с" },
              { label: "Начислено", value: monthStats.pay, unit: "с" },
            ] as const
          ).map((tile) => (
            <Box key={tile.label} sx={(t) => ({ ...cardSx(t), p: 1.25, minWidth: 0 })}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {tile.label}
              </Typography>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                <AnimatedNumber value={tile.value} />{" "}
                <Box component="span" sx={{ fontSize: 12, fontWeight: 400, color: "text.secondary" }}>
                  {tile.unit}
                </Box>
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {pipelines.length === 0 && (
        <Stack
          direction="row"
          gap={1}
          sx={(t) => ({ ...cardSx(t), fontSize: "0.8rem", color: "text.secondary" })}
        >
          <InfoOutlined sx={{ fontSize: 18, color: "text.disabled" }} />
          <span>В организации пока нет воронок — общая ставка всё равно сработает, когда они появятся.</span>
        </Stack>
      )}

      <Stack
        spacing={1.5}
        sx={{
          opacity: value.enabled ? 1 : 0.4,
          pointerEvents: value.enabled && !disabled ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
      >
        <AnimatePresence initial={false}>
          {value.rules.map((rule, idx) => {
            const allTakenElsewhere = value.rules.some(
              (r) => r.id !== rule.id && r.pipelineIds.includes(ALL_PIPELINES),
            );
            return (
              <motion.div
                key={rule.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <Box sx={cardSx}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                    <Typography variant="caption" fontWeight={600} color="text.disabled">
                      Правило по сделкам {idx + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="Удалить правило"
                      disabled={disabled}
                      onClick={() => patch({ rules: value.rules.filter((r) => r.id !== rule.id) })}
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

                  <FormControl fullWidth size="small" sx={{ mb: 1.25 }}>
                    <Select<number[]>
                      multiple
                      displayEmpty
                      value={rule.pipelineIds}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = (e.target.value as number[]).map(Number);
                        const hadAll = rule.pipelineIds.includes(ALL_PIPELINES);
                        const hasAll = next.includes(ALL_PIPELINES);
                        patchRule(rule.id, {
                          pipelineIds:
                            hasAll && !hadAll
                              ? [ALL_PIPELINES]
                              : next.filter((x) => x !== ALL_PIPELINES || next.length === 1),
                        });
                      }}
                      renderValue={(selected) =>
                        selected.length === 0 ? (
                          <Typography variant="body2" color="text.disabled">
                            Выберите воронки…
                          </Typography>
                        ) : (
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                            {selected.map((id) => (
                              <Chip
                                key={id}
                                label={pipelineName(id)}
                                size="small"
                                onDelete={() =>
                                  patchRule(rule.id, {
                                    pipelineIds: rule.pipelineIds.filter((x) => x !== id),
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
                                  bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
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
                      <MenuItem
                        value={ALL_PIPELINES}
                        disabled={allTakenElsewhere}
                        sx={{ py: 0.5, minHeight: 0, borderBottom: 1, borderColor: "divider", mb: 0.5 }}
                      >
                        <Checkbox
                          checked={rule.pipelineIds.includes(ALL_PIPELINES)}
                          size="small"
                          sx={{ p: 0.5 }}
                        />
                        <ListItemText
                          primary="Все воронки"
                          secondary={
                            allTakenElsewhere
                              ? "Уже используется в другом правиле"
                              : "Кроме воронок с отдельным правилом"
                          }
                          primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                          secondaryTypographyProps={{ variant: "caption" }}
                        />
                      </MenuItem>
                      {pipelines.map((pipeline) => (
                        <MenuItem key={pipeline.id} value={pipeline.id} sx={{ py: 0.5, minHeight: 0 }}>
                          <Checkbox
                            checked={rule.pipelineIds.includes(pipeline.id)}
                            size="small"
                            sx={{ p: 0.5 }}
                          />
                          <ListItemText
                            primary={pipeline.name}
                            primaryTypographyProps={{ variant: "body2" }}
                          />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Процент от суммы
                      </Typography>
                      <NumberField
                        value={rule.percent}
                        onChange={(v) => patchRule(rule.id, { percent: v })}
                        unit="%"
                        step={1}
                        disabled={disabled}
                      />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Фикс за сделку
                      </Typography>
                      <NumberField
                        value={rule.fixedAmount}
                        onChange={(v) => patchRule(rule.id, { fixedAmount: v })}
                        unit="с"
                        step={100}
                        disabled={disabled}
                      />
                    </Box>
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25, lineHeight: 1.5 }}>
                    {formula(rule)}
                  </Typography>
                </Box>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <Button
          variant="text"
          size="small"
          startIcon={<Add sx={{ fontSize: 16 }} />}
          onClick={() => patch({ rules: [...value.rules, emptyRule()] })}
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
          Добавить правило по сделкам
        </Button>
      </Stack>

      <Stack direction="row" gap={1} sx={{ color: "text.secondary", fontSize: "0.78rem", lineHeight: 1.5 }}>
        <InfoOutlined sx={{ fontSize: 16, mt: "2px", color: "text.disabled", flexShrink: 0 }} />
        <span>
          Считается в месяц, когда сделку перевели в этап «Выиграна». Проигранные и удалённые
          сделки не учитываются; сделки без филиала попадают только в отчёт по всей организации.
        </span>
      </Stack>
    </Stack>
  );
};

export default SalaryDealsSection;
