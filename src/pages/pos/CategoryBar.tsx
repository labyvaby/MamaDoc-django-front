import React from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";

import { POS_LAYOUT, posColors } from "./layout";

type Props = {
  categories: string[];
  active: string | null;
  onSelect: (category: string | null) => void;
};

/** Компактный выбор категории под шапкой. */
export const PosCategoryBar: React.FC<Props> = ({ categories, active, onSelect }) => {
  const theme = useTheme();
  const c = posColors(theme);

  return (
    <Box
      sx={{
        minHeight: POS_LAYOUT.categoryBarHeight,
        flexShrink: 0,
        px: "20px",
        py: "8px",
        bgcolor: c.page,
        borderBottom: `1px solid ${c.outline}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <Autocomplete
        size="small"
        options={categories}
        value={active}
        onChange={(_, value) => onSelect(value)}
        clearOnEscape
        noOptionsText="Категории не найдены"
        renderOption={(props, category) => (
          <Box component="li" {...props} key={category} sx={{ minHeight: 40 }}>
            <Typography noWrap fontSize={13}>
              {category}
            </Typography>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Поиск категории"
            inputProps={{ ...params.inputProps, "aria-label": "Поиск категории" }}
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <>
                  <SearchOutlined sx={{ color: c.textDim, fontSize: 19, mr: 0.5 }} />
                  {params.InputProps.startAdornment}
                </>
              ),
            }}
          />
        )}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              bgcolor: c.card,
              border: `1px solid ${c.hairline}`,
              backgroundImage: "none",
              boxShadow: theme.shadows[8],
            },
          },
          listbox: {
            sx: {
              maxHeight: 360,
              p: 0.5,
              "& .MuiAutocomplete-option": { borderRadius: 1, py: 1 },
              "& .MuiAutocomplete-option[aria-selected='true']": {
                bgcolor: c.accentBg,
                color: c.accentText,
              },
            },
          },
        }}
        sx={{
          width: { xs: "100%", sm: 360 },
          maxWidth: "100%",
          "& .MuiOutlinedInput-root": {
            bgcolor: c.tile,
            color: c.textSoft,
            borderRadius: 2,
            pr: "9px !important",
            "& fieldset": { borderColor: c.hairline },
            "&:hover fieldset": { borderColor: c.accent },
            "&.Mui-focused fieldset": { borderColor: c.accent },
          },
          "& .MuiAutocomplete-input": { fontSize: 13 },
        }}
      />
    </Box>
  );
};
