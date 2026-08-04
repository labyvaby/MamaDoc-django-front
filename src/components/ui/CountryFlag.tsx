import React from "react";
import { Box } from "@mui/material";

/**
 * Флаг страны для телефонных полей.
 *
 * Эмодзи-флаг («🇰🇬») не годится: Windows не рисует региональные символы и
 * показывает вместо флага буквы «KG». Поэтому рисуем SVG для стран, чьи флаги
 * у нас есть, а для остальных — ISO-код текстом.
 */
const FLAGS = import.meta.glob<string>("../../assets/flags/*.svg", {
  eager: true,
  import: "default",
  query: "?url",
});

const flagByCode = new Map<string, string>();
for (const [path, url] of Object.entries(FLAGS)) {
  const name = path.split("/").pop()?.replace(".svg", "");
  if (name) flagByCode.set(name.toUpperCase(), url);
}

export const CountryFlag: React.FC<{ code: string; size?: number }> = ({ code, size = 24 }) => {
  const url = flagByCode.get(code?.toUpperCase() ?? "");

  if (url) {
    return (
      <Box
        component="img"
        src={url}
        alt=""
        sx={{
          width: size,
          height: Math.round((size * 2) / 3),
          flexShrink: 0,
          borderRadius: "2px",
          objectFit: "cover",
          display: "block",
        }}
      />
    );
  }
  return (
    <Box
      component="span"
      sx={{
        width: size,
        flexShrink: 0,
        textAlign: "center",
        fontSize: 11,
        fontWeight: 600,
        color: "text.secondary",
      }}
    >
      {code}
    </Box>
  );
};

export default CountryFlag;
