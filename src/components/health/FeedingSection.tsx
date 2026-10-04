import React from "react";
import { Box, ButtonBase, Popover, Stack, Typography, alpha, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  getFamily,
  updateFood,
  updateHealthProfile,
  type AllergyInput,
  type FeedingPeriod,
  type FeedingType,
  type FoodIntroduction,
} from "../../api/health";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import type { Gestation } from "../../pages/patient-program/growth/growthData";
import { AppButton } from "../ui";
import { AllergyDrawer } from "./AllergyDrawer";
import { FeedingBanners } from "./feeding/FeedingBanners";
import { FeedingHowTo, FeedingNoGive } from "./feeding/FeedingHowTo";
import { FeedingNorms } from "./feeding/FeedingNormsPanel";
import { NoticeLine } from "./feeding/FeedingParts";
import { FeedingToday } from "./feeding/FeedingToday";
import { FoodDrawer, type FoodPreset } from "./feeding/FoodDrawer";
import { FoodJournal } from "./feeding/FoodJournal";
import { FoodTimeline } from "./feeding/FoodTimeline";
import {
  allergyFromReaction,
  allergyRisk,
  currentFeeding,
  feedingAge,
  feedingAgeText,
  feedingBanners,
  feedingSnapshot,
  feedingStart,
  feedingToday,
  foodProduct,
  formatDay,
  headlineParts,
  hemoglobinHint,
  todayIso,
  type FeedingFacts,
} from "./feeding/feedingAdvice";
import type { FoodProduct } from "./feeding/feedingCatalog";
import { howToFeed } from "./feeding/feedingNorms";
import { FeedingDrawer } from "./FeedingDrawer";
import { healthErrorText } from "./healthForms";
import { FEEDING_SWITCH_REASONS, FEEDING_TYPES, ageLabel, formatDate, optionLabel } from "./healthMeta";
import { useHealthScope, useInvalidateHealth, usePatientHealth } from "./useHealth";

const NEXT_TYPE: Record<FeedingType, FeedingType> = {
  breast: "mixed",
  mixed: "formula",
  formula: "general",
  general: "general",
};

const SOURCES =
  "Источники: ВОЗ 2023; программа РФ 2019, табл. 5.1; МЗ КР 2023 и 2025; ESPGHAN 2017; EAACI 2020; NHS. Подсказки — рекомендации, решение за врачом.";

interface FeedingSectionProps {
  patientId: number;
  birthDate: string | null;
  canManage: boolean;
  /** Периоды от ранних к поздним; текущий — последний. */
  feeding: ReadonlyArray<FeedingPeriod>;
  complementaryFeedingOn: string | null;
  /** Журнал прикорма из `growth/`. */
  foods: ReadonlyArray<FoodIntroduction>;
  gestation: Gestation | null;
  birthWeightKg: number | null;
  /** ИМТ последнего замера словами. */
  bmiVerdict: string;
}

interface FoodDrawerState {
  open: boolean;
  entry: FoodIntroduction | null;
  preset: FoodPreset | null;
}

const FOOD_CLOSED: FoodDrawerState = { open: false, entry: null, preset: null };

/** Периоды вскармливания чипами: вид, с какого числа, причина перевода. */
const FeedingPeriods: React.FC<{
  feeding: ReadonlyArray<FeedingPeriod>;
  birthDate: string | null;
  canManage: boolean;
  onEdit: (period: FeedingPeriod) => void;
}> = ({ feeding, birthDate, canManage, onEdit }) => {
  const theme = useTheme();
  const current = feeding[feeding.length - 1] ?? null;
  const tone = (type: FeedingType) =>
    type === "breast" ? theme.palette.success.main : type === "general" ? theme.palette.info.main : theme.palette.warning.main;
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" columnGap={1} flexWrap="wrap" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
          Периоды вскармливания
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {current
            ? `сейчас ${optionLabel(FEEDING_TYPES, current.feedingType).toLowerCase()} с ${formatDate(current.startedOn)}`
            : "не отмечены"}
        </Typography>
      </Stack>
      {feeding.length > 0 && (
        <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="stretch">
          {feeding.map((period) => {
            const color = tone(period.feedingType);
            const age = ageLabel(birthDate, period.startedOn);
            return (
              <ButtonBase
                key={period.id}
                disabled={!canManage}
                onClick={() => onEdit(period)}
                sx={{
                  display: "block",
                  textAlign: "left",
                  px: 1.25,
                  py: 0.75,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: alpha(color, 0.4),
                  bgcolor: alpha(color, period === current ? 0.16 : 0.06),
                }}
              >
                <Typography variant="body2" fontWeight={700} sx={{ color }}>
                  {optionLabel(FEEDING_TYPES, period.feedingType)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  с {formatDate(period.startedOn)}
                  {age ? ` · ${age}` : ""}
                </Typography>
                {period.switchReason && (
                  <Typography variant="caption" color="warning.main" display="block">
                    {optionLabel(FEEDING_SWITCH_REASONS, period.switchReason)}
                  </Typography>
                )}
              </ButtonBase>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};

/**
 * «Вскармливание и прикорм» (ТЗ 2026-10-04-book-feeding §4): шапка, баннеры,
 * лента, «Сегодня» и норма, как кормить и что не давать, журнал продуктов и
 * периоды вскармливания. Что видно — зависит от возраста ребёнка.
 */
export const FeedingSection: React.FC<FeedingSectionProps> = ({
  patientId,
  birthDate,
  canManage,
  feeding,
  complementaryFeedingOn,
  foods,
  gestation,
  birthWeightKg,
  bmiVerdict,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { orgId, scope, ready } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const health = usePatientHealth(patientId);
  const family = useQuery({
    queryKey: djangoQueryKeys.health.family(patientId, orgId),
    queryFn: ({ signal }) => getFamily(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const today = React.useMemo(() => todayIso(), []);
  const [foodDrawer, setFoodDrawer] = React.useState<FoodDrawerState>(FOOD_CLOSED);
  const [periodDrawer, setPeriodDrawer] = React.useState<{ open: boolean; period: FeedingPeriod | null }>({ open: false, period: null });
  const [allergy, setAllergy] = React.useState<{ food: FoodIntroduction; initial: Partial<AllergyInput> } | null>(null);
  const [dateAnchor, setDateAnchor] = React.useState<HTMLElement | null>(null);

  const allergies = React.useMemo(() => health.data?.allergies ?? [], [health.data]);
  const risk = React.useMemo(
    () =>
      allergyRisk({
        riskGroups: health.data?.profile.riskGroups ?? [],
        allergies,
        conditions: health.data?.conditions ?? [],
        family: family.data ?? [],
      }),
    [health.data, allergies, family.data],
  );
  const facts = React.useMemo<FeedingFacts>(
    () => ({ birthDate, gestation, foods, allergies, risk: risk.atRisk }),
    [birthDate, gestation, foods, allergies, risk.atRisk],
  );
  const start = React.useMemo(() => feedingStart(complementaryFeedingOn, foods)?.on ?? null, [complementaryFeedingOn, foods]);
  const age = feedingAge(birthDate, today, gestation);
  const current = currentFeeding(feeding);
  const plan = React.useMemo(
    () => feedingToday({ facts, start, birthWeightKg, bmiVerdict, today }),
    [facts, start, birthWeightKg, bmiVerdict, today],
  );
  const banners = React.useMemo(
    () => feedingBanners({ facts, start, feedingType: current?.feedingType ?? null, riskReasons: risk.reasons, today }),
    [facts, start, current, risk.reasons, today],
  );
  const snapshot = React.useMemo(() => feedingSnapshot(facts, today), [facts, today]);
  const howTo = howToFeed(age?.months ?? null, current?.feedingType ?? null, Boolean(start));
  const parts = headlineParts({ birthDate, start, foods, feeding, today });
  const months = age?.months ?? null;
  const mode = months == null ? "unknown" : months < 4 ? "infant" : months < 24 ? "full" : months < 60 ? "toddler" : "child";

  const firstFood = useMutation({
    mutationFn: (date: string | null) => updateHealthProfile(scope, patientId, { complementaryFeedingOn: date }),
    onSuccess: async (_, date) => {
      enqueueSnackbar(date ? "Первый прикорм отмечен" : "Дата первого прикорма убрана", { variant: "success" });
      await invalidate();
    },
    onError: (error) => enqueueSnackbar(healthErrorText(error), { variant: "error" }),
  });
  const linkAllergy = useMutation({
    mutationFn: (input: { foodId: number; allergyId: number }) => updateFood(scope, patientId, input.foodId, { allergyId: input.allergyId }),
    onSuccess: () => invalidate(),
    onError: (error) => enqueueSnackbar(`Аллергия внесена, но не связана с отметкой: ${healthErrorText(error)}`, { variant: "warning" }),
  });

  const openNew = (product: FoodProduct | null = null) =>
    setFoodDrawer({ open: true, entry: null, preset: product ? { product } : null });
  const openRepeat = (food: FoodIntroduction) => {
    const product = foodProduct(food);
    setFoodDrawer({
      open: true,
      entry: null,
      preset: product
        ? { product, repeat: true }
        : { product: null, custom: { name: food.productName, group: food.foodGroup, code: food.productCode }, repeat: true },
    });
  };

  const dateText = (text: string) =>
    canManage ? (
      <ButtonBase
        onClick={(event) => setDateAnchor(event.currentTarget)}
        title="Дата первого прикорма"
        sx={{
          font: "inherit",
          verticalAlign: "baseline",
          color: "primary.main",
          fontWeight: 600,
          borderBottom: `1px dashed ${alpha(theme.palette.primary.main, 0.6)}`,
          lineHeight: 1.2,
        }}
      >
        {text}
      </ButtonBase>
    ) : (
      <b>{text}</b>
    );

  const headline = (
    <Typography variant="body2" color="text.secondary" component="div">
      {parts.start ? (
        <>
          Прикорм с {dateText(formatDay(parts.start.on))}
          {parts.start.age ? ` в ${parts.start.age}` : ""}
        </>
      ) : (
        <>
          {parts.missing}
          {canManage && mode !== "child" && <> · {dateText("отметить дату")}</>}
        </>
      )}
      {parts.rest.map((part) => ` · ${part}`).join("")}
    </Typography>
  );

  const showAdvice = mode === "infant" || mode === "full";
  const header = (
    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "flex-start" }} gap={1.25}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Вскармливание и прикорм
        </Typography>
        {headline}
      </Box>
      {canManage && (
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
          {mode !== "child" && (
            <AppButton variant="contained" size="small" startIcon={<RestaurantOutlined />} onClick={() => openNew()}>
              Ввели продукт
            </AppButton>
          )}
          <AppButton
            variant="outlined"
            size="small"
            startIcon={current ? <SwapHorizOutlined /> : <AddOutlined />}
            onClick={() => setPeriodDrawer({ open: true, period: null })}
          >
            {current ? "Перевод" : "Вскармливание"}
          </AppButton>
        </Stack>
      )}
    </Stack>
  );

  const journal = (collapsed = false) => (
    <FoodJournal
      foods={foods}
      birthDate={birthDate}
      gestation={gestation}
      canManage={canManage}
      collapsed={collapsed}
      onAdd={() => openNew()}
      onEdit={(entry) => setFoodDrawer({ open: true, entry, preset: null })}
      onRepeat={openRepeat}
    />
  );
  const periods = (
    <FeedingPeriods feeding={feeding} birthDate={birthDate} canManage={canManage} onEdit={(period) => setPeriodDrawer({ open: true, period })} />
  );
  const ageCaption = age ? feedingAgeText(age) : "";
  const todayPanel = <FeedingToday plan={plan} ageText={ageCaption} canManage={canManage} onPick={(product) => openNew(product)} />;
  const hemoglobin = age && mode === "toddler" ? hemoglobinHint(age) : null;

  return (
    <Box component="section" aria-label="Вскармливание и прикорм">
      <Stack gap={2}>
        {header}
        {mode === "unknown" && <NoticeLine tone="muted">Нет даты рождения — подсказки по возрасту недоступны.</NoticeLine>}
        {showAdvice && <FeedingBanners banners={banners} canManage={canManage} onRecordAllergy={(food) => setAllergy({ food, initial: allergyFromReaction(food) })} />}

        {mode === "full" && age && (
          <>
            <FoodTimeline facts={facts} start={start} feeding={feeding} today={today} main={plan.main?.product ?? null} />
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                alignItems: "start",
                gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" },
              }}
            >
              {/* На широком экране — две колонки; на телефоне панели встают по порядку §4. */}
              <Box sx={{ display: { xs: "contents", md: "flex" }, flexDirection: "column", gap: 1.5, minWidth: 0 }}>
                <Box sx={{ order: { xs: 1, md: 0 }, minWidth: 0 }}>{todayPanel}</Box>
                {howTo && (
                  <Box sx={{ order: { xs: 3, md: 0 }, minWidth: 0 }}>
                    <FeedingHowTo howTo={howTo} hideReadiness={plan.readiness} />
                  </Box>
                )}
              </Box>
              <Box sx={{ display: { xs: "contents", md: "flex" }, flexDirection: "column", gap: 1.5, minWidth: 0 }}>
                <Box sx={{ order: { xs: 2, md: 0 }, minWidth: 0 }}>
                  <FeedingNorms snapshot={snapshot} months={age.months} />
                </Box>
                <Box sx={{ order: { xs: 4, md: 0 }, minWidth: 0 }}>
                  <FeedingNoGive months={age.months} />
                </Box>
              </Box>
            </Box>
          </>
        )}

        {mode === "infant" && age && (
          <Box sx={{ display: "grid", gap: 1.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
            {todayPanel}
            <FeedingNoGive months={age.months} />
          </Box>
        )}

        {mode === "toddler" && age && (
          <>
            {journal(true)}
            {hemoglobin && <NoticeLine tone="muted">{hemoglobin}</NoticeLine>}
            <FeedingNoGive months={age.months} />
          </>
        )}

        {(mode === "full" || mode === "infant" || mode === "unknown") && journal()}
        {mode === "child" && foods.length > 0 && journal()}
        {periods}
        {(showAdvice || mode === "toddler") && (
          <Typography variant="caption" color="text.secondary">
            {SOURCES}
          </Typography>
        )}
      </Stack>

      <Popover
        open={Boolean(dateAnchor)}
        anchorEl={dateAnchor}
        onClose={() => setDateAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ pb: 1 }}>
          <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5 }}>
            Первый прикорм
          </Typography>
          <DateCalendar
            value={complementaryFeedingOn ? dayjs(complementaryFeedingOn) : null}
            minDate={birthDate ? dayjs(birthDate) : undefined}
            maxDate={dayjs(today)}
            onChange={(value: Dayjs | null, selection) => {
              if (selection !== "finish" || !value || !value.isValid()) return;
              setDateAnchor(null);
              firstFood.mutate(value.format("YYYY-MM-DD"));
            }}
          />
          {complementaryFeedingOn && (
            <Box sx={{ px: 2 }}>
              <AppButton
                size="small"
                color="error"
                onClick={() => {
                  setDateAnchor(null);
                  firstFood.mutate(null);
                }}
              >
                Убрать дату
              </AppButton>
            </Box>
          )}
        </Box>
      </Popover>

      <FoodDrawer
        open={foodDrawer.open}
        patientId={patientId}
        facts={facts}
        start={start}
        profileDate={complementaryFeedingOn}
        entry={foodDrawer.entry}
        preset={foodDrawer.preset}
        suggestedGroup={plan.main?.product.group ?? null}
        onClose={() => setFoodDrawer(FOOD_CLOSED)}
      />
      <FeedingDrawer
        open={periodDrawer.open}
        patientId={patientId}
        birthDate={birthDate}
        period={periodDrawer.period}
        suggestedType={current ? NEXT_TYPE[current.feedingType] : "breast"}
        onClose={() => setPeriodDrawer({ open: false, period: null })}
      />
      <AllergyDrawer
        open={allergy != null}
        patientId={patientId}
        allergy={null}
        initial={allergy?.initial}
        onSaved={(saved) => {
          if (allergy) linkAllergy.mutate({ foodId: allergy.food.id, allergyId: saved.id });
        }}
        onClose={() => setAllergy(null)}
      />
    </Box>
  );
};
