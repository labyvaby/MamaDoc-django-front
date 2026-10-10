import React from "react";
import { Box, ButtonBase, Collapse, IconButton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";

import type { FoodIntroduction } from "../../../api/health";
import { subtleBorder } from "../../../theme/uiHelpers";
import { AppButton, ROW_ACTIONS_CLASS, ShowAllButton, rowActionSx, rowActionsHostSx } from "../../ui";
import { ALLERGY_STATUSES, optionLabel } from "../healthMeta";
import type { Gestation } from "../../../pages/patient-program/growth/growthData";
import { feedingAge, feedingAgeText, foodGroupOf, formatDay, groupLower, journalItems, reactionText, type JournalItem } from "./feedingAdvice";
import { Pill } from "./FeedingParts";
import { groupColor } from "./feedingUi";

const PAGE = 8;

const Row: React.FC<{
  item: JournalItem;
  birthDate: string | null;
  gestation: Gestation | null;
  canManage: boolean;
  onEdit: (food: FoodIntroduction) => void;
  onRepeat: (food: FoodIntroduction) => void;
}> = ({ item, birthDate, gestation, canManage, onEdit, onRepeat }) => {
  const theme = useTheme();
  const { food } = item;
  const age = feedingAge(birthDate, food.givenOn, gestation);
  const group = foodGroupOf(food);
  const reaction = reactionText(food);
  const allergy = food.allergy;
  const date = (
    <Typography variant="body2" fontWeight={600} component="span" sx={{ fontVariantNumeric: "tabular-nums", mr: 0.75 }}>
      {formatDay(food.givenOn)}
    </Typography>
  );
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "118px minmax(0, 1fr) auto" },
        columnGap: 1.5,
        rowGap: 0.5,
        alignItems: "start",
        py: 1.1,
        borderTop: `1px solid ${subtleBorder(theme)}`,
        ...rowActionsHostSx,
      }}
    >
      <Box sx={{ gridColumn: { xs: "1 / 2", md: "auto" }, minWidth: 0 }}>
        {food.createdBy ? (
          <Tooltip title={`Кто отметил: ${food.createdBy.fullName}`} arrow describeChild enterTouchDelay={0}>
            {date}
          </Tooltip>
        ) : (
          date
        )}
        {age && (
          <Typography variant="caption" color="text.secondary" component="span" sx={{ display: { xs: "inline", md: "block" } }}>
            {feedingAgeText(age)}
          </Typography>
        )}
      </Box>
      <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, gridRow: { xs: 2, md: "auto" }, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          <Box sx={{ width: 9, height: 9, borderRadius: "3px", bgcolor: groupColor(theme, group), flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={700}>
            {food.productName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {groupLower(group)}
          </Typography>
          {reaction && (
            <Pill tone="bad" dense dot>
              {reaction}
            </Pill>
          )}
          {allergy && (
            <Pill tone={allergy.status === "active" ? "bad" : "muted"} dense outlined={allergy.status === "active"}>
              в аллергиях: {allergy.allergen}
              {allergy.status !== "active" ? ` (${optionLabel(ALLERGY_STATUSES, allergy.status).toLowerCase()})` : ""}
            </Pill>
          )}
          {item.repeat && (
            <Pill tone="muted" dense>
              повторно
            </Pill>
          )}
        </Stack>
        {food.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: "anywhere" }}>
            {food.notes}
          </Typography>
        )}
      </Box>
      {canManage && (
        <Stack direction="row" gap={0.5} alignItems="center" sx={{ gridColumn: { xs: "2 / 3", md: "auto" }, gridRow: { xs: 1, md: "auto" } }}>
          {item.canRepeat && (
            <AppButton size="small" variant="outlined" color="error" startIcon={<ReplayRounded />} onClick={() => onRepeat(food)}>
              Дали снова
            </AppButton>
          )}
          <Tooltip title="Исправить отметку">
            <IconButton
              size="small"
              className={ROW_ACTIONS_CLASS}
              aria-label={`Исправить отметку «${food.productName}»`}
              onClick={() => onEdit(food)}
              sx={rowActionSx}
            >
              <EditOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
};

interface FoodJournalProps {
  foods: ReadonlyArray<FoodIntroduction>;
  birthDate: string | null;
  gestation: Gestation | null;
  canManage: boolean;
  /** С 2 лет журнал свёрнут. */
  collapsed?: boolean;
  onAdd: () => void;
  onEdit: (food: FoodIntroduction) => void;
  onRepeat: (food: FoodIntroduction) => void;
}

/** Журнал продуктов (§4, п. 6): от новых к старым, 8 строк и «Показать все». */
export const FoodJournal: React.FC<FoodJournalProps> = ({
  foods,
  birthDate,
  gestation,
  canManage,
  collapsed = false,
  onAdd,
  onEdit,
  onRepeat,
}) => {
  const items = React.useMemo(() => journalItems(foods), [foods]);
  const [open, setOpen] = React.useState(!collapsed);
  const [all, setAll] = React.useState(false);
  React.useEffect(() => setOpen(!collapsed), [collapsed]);
  const shown = all ? items : items.slice(0, PAGE);

  const header = (
    <Stack direction="row" alignItems="baseline" gap={1}>
      <Typography variant="subtitle2" fontWeight={700}>
        Журнал продуктов
      </Typography>
      {items.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {items.length}
        </Typography>
      )}
    </Stack>
  );

  return (
    <Box>
      {collapsed ? (
        <ButtonBase onClick={() => setOpen((value) => !value)} aria-expanded={open} sx={{ borderRadius: "8px", px: 0.5, gap: 0.5 }}>
          <ExpandMoreOutlined fontSize="small" sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", color: "text.secondary" }} />
          {header}
        </ButtonBase>
      ) : (
        header
      )}
      <Collapse in={open} unmountOnExit>
        {items.length === 0 ? (
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ xs: "flex-start", md: "center" }} sx={{ mt: 1 }}>
            <RestaurantOutlined color="disabled" sx={{ display: { xs: "none", md: "block" } }} />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              Продуктов в журнале пока нет. Отмечайте каждый новый продукт — так видно, что ребёнок уже ест и на что была реакция
            </Typography>
            {canManage && (
              <AppButton variant="outlined" size="small" startIcon={<RestaurantOutlined />} onClick={onAdd}>
                Ввели продукт
              </AppButton>
            )}
          </Stack>
        ) : (
          <Box sx={{ mt: 0.5 }}>
            {shown.map((item) => (
              <Row
                key={item.food.id}
                item={item}
                birthDate={birthDate}
                gestation={gestation}
                canManage={canManage}
                onEdit={onEdit}
                onRepeat={onRepeat}
              />
            ))}
            <ShowAllButton total={items.length} limit={PAGE} expanded={all} onToggle={() => setAll((value) => !value)} />
          </Box>
        )}
      </Collapse>
    </Box>
  );
};
