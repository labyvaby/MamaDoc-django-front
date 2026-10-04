import React from "react";
import {
  Box,
  Chip,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createFood,
  deleteFood,
  updateFood,
  updateHealthProfile,
  type Allergy,
  type AllergyInput,
  type FoodGroup,
  type FoodIntroduction,
  type FoodIntroductionInput,
  type FoodReaction,
  type FoodReactionSeverity,
} from "../../../api/health";
import { ChipGroup, Section } from "../../../pages/patient-program/vision/VisionControls";
import type { ChipTone } from "../../../pages/patient-program/vision/visionUi";
import { subtleBorder } from "../../../theme/uiHelpers";
import { AppButton, CustomDatePicker } from "../../ui";
import { AllergyDrawer } from "../AllergyDrawer";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { healthErrorText } from "../healthForms";
import { useHealthScope, useInvalidateHealth } from "../useHealth";
import {
  STATUS_TONE,
  STATUS_WORD,
  allergyFromReaction,
  drawerAdvice,
  feedingAge,
  feedingAgeText,
  feedingSnapshot,
  firstFeedingOption,
  foodProduct,
  hasPhrase,
  stateChipLabel,
  todayIso,
  togglePhrase,
  type FeedingFacts,
  type StatusTone,
} from "./feedingAdvice";
import {
  FOOD_GROUP_OPTIONS,
  FOOD_PRODUCTS,
  FOOD_REACTIONS,
  FOOD_SEVERITIES,
  REACTION_PHRASES,
  groupInfo,
  normText,
  type FoodProduct,
} from "./feedingCatalog";
import { NoticeLine, Pill } from "./FeedingParts";
import { groupColor, warningTone } from "./feedingUi";

/** Что открыть в окне: продукт из «Сегодня» или «Дали снова». */
export interface FoodPreset {
  product: FoodProduct | null;
  /** Свой продукт — «Дали снова» у продукта не из каталога (код — если был). */
  custom?: { name: string; group: FoodGroup; code?: string } | null;
  repeat?: boolean;
}

interface FoodForm {
  product: FoodProduct | null;
  custom: boolean;
  /** Код отметки, которого нет в нынешнем каталоге, — сохраняем как был. */
  keptCode: string;
  customName: string;
  customGroup: FoodGroup;
  givenOn: string;
  reaction: FoodReaction;
  severity: FoodReactionSeverity;
  notes: string;
  allergyId: number | null;
  allergyLabel: string | null;
}

const CHIP_COLOR: Record<StatusTone, "success" | "error" | "warning" | "primary" | "default"> = {
  ok: "success",
  bad: "error",
  warn: "warning",
  on: "primary",
  muted: "default",
};

const severityTone = (value: string): ChipTone => (value === "severe" ? "error" : value === "moderate" ? "warning" : "primary");

interface FoodDrawerProps {
  open: boolean;
  patientId: number;
  facts: FeedingFacts;
  /** Начало прикорма: дата профиля или первая отметка. */
  start: string | null;
  /** Дата первого прикорма в профиле. */
  profileDate: string | null;
  /** Правка отметки; null — новая. */
  entry: FoodIntroduction | null;
  preset: FoodPreset | null;
  /** Группа, открытая по умолчанию, — продукт из «Сегодня». */
  suggestedGroup: FoodGroup | null;
  onClose: () => void;
}

/**
 * Окно «Ввели продукт» (§5): дата и возраст, продукт с поиском и статусами,
 * реакция с тяжестью и быстрыми фразами, первый прикорм и предупреждения на
 * дату отметки. Предупреждения сохранить не мешают — отметка это факт.
 */
export const FoodDrawer: React.FC<FoodDrawerProps> = ({
  open,
  patientId,
  facts,
  start,
  profileDate,
  entry,
  preset,
  suggestedGroup,
  onClose,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const today = React.useMemo(() => todayIso(), []);
  const [form, setForm] = React.useState<FoodForm>(() => emptyForm(today));
  const [pickerOpen, setPickerOpen] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [group, setGroup] = React.useState<FoodGroup>("vegetables");
  const [firstOn, setFirstOn] = React.useState(false);
  const [allergyInitial, setAllergyInitial] = React.useState<Partial<AllergyInput> | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = entry ? formFromEntry(entry) : formFromPreset(preset, today);
    setForm(next);
    setPickerOpen(!next.product && !next.custom);
    setSearch("");
    setGroup(next.product?.group ?? (next.custom ? next.customGroup : suggestedGroup ?? "vegetables"));
  }, [open, entry, preset, suggestedGroup, today]);

  const patch = (next: Partial<FoodForm>) => setForm((current) => ({ ...current, ...next }));
  const snapshot = React.useMemo(() => feedingSnapshot(facts, form.givenOn || today, entry?.id), [facts, form.givenOn, today, entry]);
  const age = feedingAge(facts.birthDate, form.givenOn || today, facts.gestation);
  const name = form.product?.name ?? form.customName.trim();
  const custom = form.custom ? { name: form.customName, group: form.customGroup } : null;
  const advice = drawerAdvice({
    facts,
    start,
    product: form.custom ? null : form.product,
    custom,
    givenOn: form.givenOn || today,
    reaction: form.reaction,
    severity: form.severity,
    notes: form.notes,
    editingId: entry?.id ?? null,
    allergyLinked: form.allergyId != null,
  });
  const option = firstFeedingOption({
    profileDate,
    foods: facts.foods,
    givenOn: form.givenOn,
    product: form.custom ? null : form.product,
    editingId: entry?.id ?? null,
  });
  const optionKey = option ? `${option.kind}-${form.product?.code ?? "custom"}` : "none";
  React.useEffect(() => {
    setFirstOn(option?.defaultOn ?? false);
    // Значение по умолчанию — заново при смене продукта или вида предложения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionKey, open]);

  const dateError =
    !form.givenOn || !dayjs(form.givenOn).isValid()
      ? "Укажите дату"
      : facts.birthDate && form.givenOn < facts.birthDate
        ? "Дата раньше рождения"
        : form.givenOn > today
          ? "Дата ещё не наступила"
          : null;
  const needsSeverity = form.reaction !== "none" && !form.severity;
  const needsNotes = form.reaction === "other" && !form.notes.trim();
  const canSave = Boolean(name) && !dateError && !needsSeverity && !needsNotes;

  const payload = (): FoodIntroductionInput => ({
    productCode: form.custom ? form.keptCode : form.product?.code ?? "",
    productName: name,
    foodGroup: form.custom ? form.customGroup : form.product?.group ?? form.customGroup,
    givenOn: form.givenOn,
    reaction: form.reaction,
    reactionSeverity: form.reaction === "none" ? "" : form.severity,
    notes: form.notes.trim(),
    allergyId: form.allergyId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = payload();
      const saved = entry ? await updateFood(scope, patientId, entry.id, body) : await createFood(scope, patientId, body);
      let profileError: unknown = null;
      if (option && firstOn) {
        try {
          await updateHealthProfile(scope, patientId, { complementaryFeedingOn: body.givenOn });
        } catch (error) {
          profileError = error;
        }
      }
      return { saved, profileError };
    },
    onSuccess: async ({ profileError }) => {
      enqueueSnackbar(entry ? "Отметка исправлена" : "Продукт отмечен", { variant: "success" });
      if (profileError) {
        enqueueSnackbar(`Дату первого прикорма записать не удалось: ${healthErrorText(profileError)}`, { variant: "warning" });
      }
      await invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteFood(scope, patientId, (entry as FoodIntroduction).id),
    onSuccess: async () => {
      enqueueSnackbar("Отметка удалена", { variant: "success" });
      await invalidate();
      onClose();
    },
  });
  const link = useMutation({
    mutationFn: (allergyId: number) => updateFood(scope, patientId, (entry as FoodIntroduction).id, { allergyId }),
    onSuccess: () => invalidate(),
    onError: (error) => enqueueSnackbar(healthErrorText(error), { variant: "error" }),
  });
  // Ошибка прошлой попытки не должна встречать при новом открытии окна.
  const resetSave = save.reset;
  const resetRemove = remove.reset;
  React.useEffect(() => {
    if (!open) return;
    resetSave();
    resetRemove();
  }, [open, resetSave, resetRemove]);

  const onAllergySaved = (allergy: Allergy) => {
    patch({ allergyId: allergy.id, allergyLabel: allergy.allergen });
    // У сохранённой отметки связь пишем сразу, у новой — вместе с отметкой.
    if (entry) link.mutate(allergy.id);
  };

  const openAllergy = () =>
    setAllergyInitial(
      allergyFromReaction({
        productCode: form.custom ? "" : form.product?.code ?? "",
        productName: name,
        givenOn: form.givenOn,
        reaction: form.reaction,
        reactionSeverity: form.severity,
        notes: form.notes,
      }),
    );

  const pickProduct = (product: FoodProduct) => {
    patch({ product, custom: false, keptCode: "" });
    setPickerOpen(false);
  };

  const query = normText(search);
  const visible = query
    ? FOOD_PRODUCTS.filter((product) => normText(product.name).includes(query))
    : FOOD_PRODUCTS.filter((product) => product.group === group);
  const canDelete = entry != null && entry.reaction === "none" && entry.allergy == null;
  const title = entry ? "Отметка продукта" : preset?.repeat ? "Дали снова" : "Ввели продукт";
  const subtitle = name ? [name, age ? feedingAgeText(age) : ""].filter(Boolean).join(" · ") : "Выберите продукт";
  const productWarnings = advice.warnings.filter((item) => item.key !== "urgent");
  const urgent = advice.warnings.find((item) => item.key === "urgent");
  const state = form.product && !form.custom ? snapshot.state(form.product) : null;
  const phrases = REACTION_PHRASES[form.reaction] ?? [];

  return (
    <>
      <HealthDrawerShell
        open={open}
        title={title}
        subtitle={subtitle}
        pending={save.isPending || remove.isPending}
        error={save.error ?? remove.error}
        canSave={canSave}
        saveLabel={entry ? "Сохранить" : "Отметить"}
        onSave={() => save.mutate()}
        onClose={onClose}
        footerStart={
          canDelete ? (
            <AppButton color="error" startIcon={<DeleteOutlineOutlined />} loading={remove.isPending} onClick={() => remove.mutate()}>
              Удалить
            </AppButton>
          ) : undefined
        }
      >
        <Box>
          <CustomDatePicker
            label="Когда дали"
            value={form.givenOn ? dayjs(form.givenOn) : null}
            onChange={(value) => {
              const date = value as Dayjs | null;
              patch({ givenOn: date && date.isValid() ? date.format("YYYY-MM-DD") : "" });
            }}
            minDate={facts.birthDate ? dayjs(facts.birthDate) : undefined}
            maxDate={dayjs(today)}
            slotProps={{ textField: { size: "small", fullWidth: true, error: Boolean(dateError && form.givenOn), helperText: form.givenOn ? dateError ?? undefined : undefined } }}
          />
          {age && !dateError && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, pl: 0.25 }}>
              Возраст: {feedingAgeText(age)}
            </Typography>
          )}
        </Box>

        <Section
          title="Продукт"
          action={
            !pickerOpen && (
              <AppButton size="small" variant="text" onClick={() => setPickerOpen(true)}>
                Другой продукт
              </AppButton>
            )
          }
        >
          {!pickerOpen && (form.product || form.custom) ? (
            <Stack
              direction="row"
              gap={1.25}
              alignItems="flex-start"
              sx={{ p: 1.25, borderRadius: "12px", border: `1px solid ${subtleBorder(theme)}` }}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: "3px", mt: "6px", bgcolor: groupColor(theme, form.product?.group ?? form.customGroup) }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
                  <Typography variant="body1" fontWeight={700}>
                    {name || "Свой продукт"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {groupInfo(form.product?.group ?? form.customGroup).lower}
                  </Typography>
                  {state && (
                    <Pill tone={STATUS_TONE[state.status]} dense dot>
                      {stateChipLabel(state) || STATUS_WORD[state.status]}
                    </Pill>
                  )}
                </Stack>
                {form.product?.note && (
                  <Typography variant="caption" color="text.secondary">
                    {form.product.note}
                  </Typography>
                )}
              </Box>
            </Stack>
          ) : (
            <Stack gap={1.25}>
              <TextField
                size="small"
                placeholder="Найти продукт"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              {!query && (
                <ChipGroup<FoodGroup> label="Группа" options={FOOD_GROUP_OPTIONS} selected={[group]} onToggle={(value) => setGroup(value)} />
              )}
              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ pt: 0.25 }}>
                {visible.map((product) => {
                  const productState = snapshot.state(product);
                  const tone = STATUS_TONE[productState.status];
                  const selected = form.product?.code === product.code && !form.custom;
                  const label = stateChipLabel(productState);
                  return (
                    <Chip
                      key={product.code}
                      size="small"
                      clickable
                      onClick={() => pickProduct(product)}
                      color={selected ? "primary" : CHIP_COLOR[tone]}
                      variant={selected ? "filled" : "outlined"}
                      aria-pressed={selected}
                      label={
                        <span>
                          {product.name}
                          {label && label !== "можно" && (
                            <Box component="span" sx={{ ml: 0.75, opacity: 0.8, fontSize: 11.5 }}>
                              {label}
                            </Box>
                          )}
                        </span>
                      }
                      sx={{
                        height: "auto",
                        minHeight: 30,
                        borderRadius: "8px",
                        maxWidth: "100%",
                        "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 },
                        ...(tone === "muted" && !selected ? { color: "text.secondary", borderStyle: "dashed" } : null),
                      }}
                    />
                  );
                })}
                {!visible.length && (
                  <Typography variant="body2" color="text.secondary">
                    В каталоге нет — отметьте как свой продукт.
                  </Typography>
                )}
                <Chip
                  size="small"
                  clickable
                  label="Свой продукт"
                  variant={form.custom ? "filled" : "outlined"}
                  color={form.custom ? "primary" : "default"}
                  onClick={() =>
                    patch({
                      custom: true,
                      product: null,
                      keptCode: "",
                      customName: form.customName || search.trim(),
                      customGroup: query ? form.customGroup : group,
                    })
                  }
                  sx={{ height: 30, borderRadius: "8px", borderStyle: form.custom ? undefined : "dashed" }}
                />
              </Stack>
              {form.custom && (
                <Stack gap={1.25} sx={{ pl: 1, borderLeft: `2px solid ${subtleBorder(theme)}` }}>
                  <TextField
                    size="small"
                    label="Название"
                    value={form.customName}
                    onChange={(event) => patch({ customName: event.target.value })}
                    required
                    fullWidth
                    autoFocus
                  />
                  <ChipGroup<FoodGroup>
                    label="Группа своего продукта"
                    options={FOOD_GROUP_OPTIONS}
                    selected={[form.customGroup]}
                    onToggle={(value) => patch({ customGroup: value })}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Аллерген своего продукта — его название.
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}
        </Section>

        {name && (
          <Stack gap={0.75}>
            {productWarnings.map((item) => (
              <NoticeLine key={item.key} tone={warningTone(item.tone)}>
                {item.text}
              </NoticeLine>
            ))}
          </Stack>
        )}

        <Section title="Реакция">
          <ChipGroup<FoodReaction>
            label="Реакция"
            options={FOOD_REACTIONS}
            selected={[form.reaction]}
            tone={(value) => (value === "none" ? "success" : "error")}
            onToggle={(value) => patch({ reaction: value, severity: value === "none" ? "" : form.severity })}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            Реакцию ждут от минут до 2 ч, на белок коровьего молока — до 3 суток; её можно отметить позже
          </Typography>
        </Section>

        {form.reaction !== "none" && (
          <>
            <Section title="Тяжесть">
              <ChipGroup
                label="Тяжесть"
                options={FOOD_SEVERITIES}
                selected={form.severity ? [form.severity] : []}
                tone={severityTone}
                onToggle={(value) => patch({ severity: value })}
              />
              {needsSeverity && (
                <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
                  Укажите тяжесть реакции
                </Typography>
              )}
            </Section>
            {phrases.length > 0 && (
              <Section title="Быстро в заметку">
                <ChipGroup<string>
                  label="Быстрые фразы"
                  options={phrases.map((phrase) => ({ value: phrase, label: phrase }))}
                  selected={phrases.filter((phrase) => hasPhrase(form.notes, phrase))}
                  tone={() => "warning"}
                  onToggle={(phrase) => patch({ notes: togglePhrase(form.notes, phrase) })}
                />
              </Section>
            )}
          </>
        )}

        <TextField
          size="small"
          label="Заметка"
          placeholder={form.reaction === "none" ? "Сколько дали, как перенёс" : "Что было, через сколько, сколько длилось"}
          value={form.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          required={form.reaction === "other"}
          error={needsNotes && form.notes.length > 0}
          helperText={needsNotes ? "Опишите реакцию" : undefined}
          multiline
          minRows={2}
          fullWidth
        />

        {(urgent || advice.offerAllergy || form.allergyLabel) && (
          <Stack gap={0.75}>
            {urgent && <NoticeLine tone="bad">{urgent.text}</NoticeLine>}
            {form.allergyLabel ? (
              <Stack direction="row" gap={0.75} alignItems="center">
                <CheckCircleOutlineRounded fontSize="small" color="success" />
                <Typography variant="body2">В аллергиях: {form.allergyLabel}</Typography>
              </Stack>
            ) : (
              advice.offerAllergy && (
                <NoticeLine
                  tone="bad"
                  action={
                    <AppButton size="small" variant="outlined" color="error" onClick={openAllergy} sx={{ bgcolor: "background.paper" }}>
                      Внести
                    </AppButton>
                  }
                >
                  Реакция на «{name}» — внести в аллергии, чтобы её видели все?
                </NoticeLine>
              )
            )}
          </Stack>
        )}

        {option && (
          <FormControlLabel
            sx={{ m: 0, alignItems: "flex-start" }}
            control={<Switch checked={firstOn} onChange={(event) => setFirstOn(event.target.checked)} sx={{ mt: -0.5 }} />}
            label={
              <Box>
                <Typography variant="body2">
                  {option.kind === "set" ? "С этой даты — первый прикорм" : "Поправить дату первого прикорма"}
                </Typography>
                {option.kind === "fix" && profileDate && (
                  <Typography variant="caption" color="text.secondary">
                    Сейчас записано {dayjs(profileDate).format("DD.MM.YYYY")}
                  </Typography>
                )}
              </Box>
            }
          />
        )}
      </HealthDrawerShell>
      <AllergyDrawer
        open={allergyInitial != null}
        patientId={patientId}
        allergy={null}
        initial={allergyInitial ?? undefined}
        onSaved={onAllergySaved}
        onClose={() => setAllergyInitial(null)}
      />
    </>
  );
};

function emptyForm(today: string): FoodForm {
  return {
    product: null,
    custom: false,
    keptCode: "",
    customName: "",
    customGroup: "vegetables",
    givenOn: today,
    reaction: "none",
    severity: "",
    notes: "",
    allergyId: null,
    allergyLabel: null,
  };
}

function formFromEntry(entry: FoodIntroduction): FoodForm {
  const product = foodProduct(entry);
  return {
    product,
    custom: product == null,
    keptCode: product ? "" : entry.productCode,
    customName: product ? "" : entry.productName,
    customGroup: entry.foodGroup,
    givenOn: entry.givenOn,
    reaction: entry.reaction,
    severity: entry.reactionSeverity,
    notes: entry.notes,
    allergyId: entry.allergy?.id ?? null,
    allergyLabel: entry.allergy?.allergen ?? null,
  };
}

function formFromPreset(preset: FoodPreset | null, today: string): FoodForm {
  const form = emptyForm(today);
  if (!preset) return form;
  if (preset.product) return { ...form, product: preset.product };
  if (preset.custom) {
    return { ...form, custom: true, keptCode: preset.custom.code ?? "", customName: preset.custom.name, customGroup: preset.custom.group };
  }
  return form;
}
