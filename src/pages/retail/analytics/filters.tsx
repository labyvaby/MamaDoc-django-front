import React from "react";
import { Autocomplete, createFilterOptions, MenuItem, TextField } from "@mui/material";

import type { RetailCollection } from "../../../api/retailAnalytics";
import { ALL_SEASONS, seasonLabel, seasonOptions } from "../retailAnalyticsModel";

export const SeasonSelect: React.FC<{
  collections: RetailCollection[];
  value: string;
  onChange: (season: string) => void;
}> = ({ collections, value, onChange }) => {
  const options = React.useMemo(() => seasonOptions(collections), [collections]);
  return (
    <TextField
      select
      size="small"
      label="Сезон"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 160 }}
    >
      <MenuItem value={ALL_SEASONS}>Все сезоны</MenuItem>
      {options.map((season) => (
        <MenuItem key={season || "none"} value={season}>
          {seasonLabel(season)}
        </MenuItem>
      ))}
    </TextField>
  );
};

// Моделей бывают тысячи: список показывает первые совпадения, остальное — поиском.
const filterModels = createFilterOptions<RetailCollection>({ limit: 100, stringify: (option) => option.modelName });

export const ModelPicker: React.FC<{
  collections: RetailCollection[];
  value: number | null;
  onChange: (modelId: number | null) => void;
  label?: string;
  loading?: boolean;
  minWidth?: number;
}> = ({ collections, value, onChange, label = "Модель", loading, minWidth = 280 }) => {
  const selected = collections.find((c) => c.modelId === value) ?? null;
  return (
    <Autocomplete
      size="small"
      options={collections}
      loading={loading}
      value={selected}
      onChange={(_event, next) => onChange(next ? next.modelId : null)}
      filterOptions={filterModels}
      getOptionLabel={(option) => option.modelName}
      isOptionEqualToValue={(option, current) => option.modelId === current.modelId}
      renderOption={(props, option) => (
        <li {...props} key={option.modelId}>
          {option.modelName}
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Начните вводить название" />}
      sx={{ minWidth, flex: 1, maxWidth: 520 }}
    />
  );
};
