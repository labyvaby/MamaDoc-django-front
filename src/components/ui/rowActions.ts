import type { SystemStyleObject, Theme } from "@mui/system";

/**
 * Действия строки списка (карандаш правки и т.п.) на компьютере появляются
 * при наведении или фокусе на строку, на телефоне и сенсорных экранах видны
 * всегда. Образец — EmployeeList.tsx. Строке — `rowActionsHostSx`, кнопке —
 * `className={ROW_ACTIONS_CLASS}` и `rowActionSx`.
 */
export const ROW_ACTIONS_CLASS = "row-actions";

export const rowActionsHostSx: SystemStyleObject<Theme> = {
  [`&:hover .${ROW_ACTIONS_CLASS}, &:focus-within .${ROW_ACTIONS_CLASS}`]: { opacity: 1 },
};

export const rowActionSx: SystemStyleObject<Theme> = {
  opacity: { xs: 1, md: 0 },
  transition: "opacity .15s ease",
  "@media (hover: none)": { opacity: 1 },
};
