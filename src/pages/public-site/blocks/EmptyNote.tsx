import React from "react";
import { Typography } from "@mui/material";

/**
 * Подпись пустого блока. Блок, включённый владельцем, но пока без данных, лучше
 * объяснить одной строкой, чем показать пустое место: гость иначе решит, что
 * страница не догрузилась.
 */
export const EmptyNote: React.FC<{ text: string }> = ({ text }) => (
  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{text}</Typography>
);
