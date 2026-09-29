/**
 * Иконка слева в поле — для тех полей, что не FormField: выпадающие списки
 * с несколькими значениями и автодополнение (Autocomplete). Тот же вид, что
 * у FormField, чтобы все поля форм отеля выглядели одинаково.
 */
import React from "react";
import { InputAdornment } from "@mui/material";

export const FieldIcon: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <InputAdornment position="start" sx={{ color: "text.disabled", "& svg": { fontSize: 20 } }}>
    {icon}
  </InputAdornment>
);

export default FieldIcon;
