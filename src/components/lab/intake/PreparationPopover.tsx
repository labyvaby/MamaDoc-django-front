import React from "react";
import { IconButton, Popover, Stack, Tooltip, Typography } from "@mui/material";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import { useQuery } from "@tanstack/react-query";

import { getLabTestCard } from "../../../api/lab";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";

interface Props {
  testId: number;
  title: string;
}

/**
 * Памятка подготовки одного анализа — значком в строке корзины и попапом.
 *
 * Сводная памятка на весь набор годится для печати, но читать её с экрана,
 * когда анализов пять, невозможно: абзацы на двух языках сливаются, и не
 * понять, что к какому анализу относится. Здесь памятка открывается по
 * одному анализу, ровно у той строки, про которую спрашивает пациент.
 *
 * Значок показывается только у анализов с памяткой (`hasPreparation` из
 * каталога), текст грузится по клику и кэшируется: карточка анализа —
 * отдельный запрос, тянуть её на каждую строку заранее незачем.
 */
const PreparationPopover: React.FC<Props> = ({ testId, title }) => {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const open = anchor !== null;

  const cardQuery = useQuery({
    queryKey: [...djangoQueryKeys.lab.all, "testCard", testId],
    queryFn: ({ signal }) => getLabTestCard(testId, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const text = cardQuery.data?.preparation?.text?.trim() ?? "";

  return (
    <>
      <Tooltip title="Подготовка к анализу">
        <IconButton
          size="small"
          aria-label={`Подготовка: ${title}`}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ flexShrink: 0, color: open ? "primary.main" : "action.active" }}
        >
          <MenuBookOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 440, p: 2, borderRadius: "12px" } } }}
      >
        <Stack spacing={1}>
          <Typography variant="subtitle2">{title}</Typography>
          {cardQuery.isLoading ? (
            <Typography variant="body2" color="text.secondary">
              Загружаем памятку…
            </Typography>
          ) : cardQuery.isError ? (
            <Typography variant="body2" color="error.main">
              Не удалось загрузить памятку. Попробуйте ещё раз.
            </Typography>
          ) : text ? (
            <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
              {text}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Особой подготовки не требуется.
            </Typography>
          )}
        </Stack>
      </Popover>
    </>
  );
};

export default PreparationPopover;
