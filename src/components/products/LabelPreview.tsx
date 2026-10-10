import React from "react";
import { Box, type SxProps, type Theme } from "@mui/material";

import type { PriceTag } from "../../api/printforms";
import { labelPreviewMarkup, type LabelLayout } from "../../utility/labelLayout";

const MM_TO_PX = 96 / 25.4;

/**
 * Одна этикетка в масштабе — тем же HTML, что уходит на печать.
 *
 * Рисуется в Shadow DOM, а не во фрейме: стили всё так же отделены от темы
 * CRM, но обновление идёт в том же кадре. Фрейм при каждой правке
 * перезагружал документ, и этикетка мигала, пока тянешь элемент или меняешь
 * кегль.
 */
export const LabelPreview: React.FC<{
  tag: PriceTag;
  layout: LabelLayout;
  organizationName: string;
  scale: number;
  sx?: SxProps<Theme>;
}> = ({ tag, layout, organizationName, scale, sx }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const markup = React.useMemo(
    () => labelPreviewMarkup(tag, layout, organizationName),
    [tag, layout, organizationName],
  );

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = markup;
  }, [markup]);

  return (
    <Box
      ref={hostRef}
      aria-hidden
      sx={[
        {
          width: layout.widthMm * MM_TO_PX,
          height: layout.heightMm * MM_TO_PX,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          pointerEvents: "none",
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
};
