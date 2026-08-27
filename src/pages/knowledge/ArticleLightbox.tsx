import React from "react";
import { Box, Dialog, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ZoomInOutlined from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlined from "@mui/icons-material/ZoomOutOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

/** Масштабы по кругу: тап по картинке и кнопка зума переключают между ними. */
const ZOOM_STEPS = [1, 2.5] as const;
/** Порог свайпа — доля ширины сцены, после которой палец листает. */
const SWIPE_RATIO = 0.18;
/** Минимум в пикселях, чтобы случайный сдвиг при тапе не листал. */
const SWIPE_MIN_PX = 48;
/** Потянуть вниз на столько — закрыть просмотр. */
const CLOSE_DRAG_PX = 110;

interface ArticleLightboxProps {
  /** Все картинки статьи по порядку — по ним листает свайп. */
  images: string[];
  /** Индекс открытой картинки; null — просмотр закрыт. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Полноэкранный просмотр картинок статьи. Нужен именно на телефоне: половина
 * материалов базы знаний — сфотографированные памятки и схемы, а в колонке
 * текста шириной в экран мелкий текст на картинке не прочитать. Тап по
 * картинке в статье открывает её здесь: зум, панорама пальцем, листание
 * свайпом между всеми картинками статьи.
 *
 * Жесты на Pointer Events, а не на touch: иначе нативный drag-and-drop
 * изображения перехватывает жест и до конца свайпа дело не доходит (та же
 * причина, что в PhotoViewerDialog уборки).
 */
const ArticleLightbox: React.FC<ArticleLightboxProps> = ({
  images,
  index,
  onIndexChange,
  onClose,
}) => {
  const open = index != null && index >= 0 && index < images.length;
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [drag, setDrag] = React.useState({ x: 0, y: 0 });
  const gesture = React.useRef<{ x: number; y: number; panning: boolean } | null>(null);
  const sceneRef = React.useRef<HTMLDivElement | null>(null);

  // Новая картинка открывается в исходном масштабе — иначе после зума соседняя
  // показалась бы обрезанным фрагментом.
  React.useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, [index]);

  const go = React.useCallback(
    (delta: number) => {
      if (index == null) return;
      const next = index + delta;
      if (next < 0 || next >= images.length) return;
      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const toggleZoom = () => {
    setZoom((z) => (z === ZOOM_STEPS[0] ? ZOOM_STEPS[1] : ZOOM_STEPS[0]));
    setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Нажатие на кнопку внутри сцены (стрелки листания) — не жест по картинке.
    // Без этой проверки клик по стрелке и листал, и переключал масштаб: жест
    // получался нулевой длины, а нулевой жест — это «тап по картинке».
    // Поля вокруг картинки при этом остаются рабочими: у портретного фото они
    // занимают половину сцены, и свайп чаще всего начинается именно там.
    if ((e.target as HTMLElement).closest("button")) {
      gesture.current = null;
      return;
    }
    gesture.current = { x: e.clientX, y: e.clientY, panning: zoom > 1 };
    // Захват нужен, чтобы жест не терялся при выходе за края сцены, но он
    // доступен не для любого типа указателя. Ставим его после записи жеста и
    // под try: иначе отказ браузера обрывал бы сам свайп (как в
    // PhotoViewerDialog уборки).
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* захват недоступен — жест отработает по событиям самой сцены */
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.panning) {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      gesture.current = { ...g, x: e.clientX, y: e.clientY };
      return;
    }
    setDrag({ x: dx, y: dy });
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.panning) return;
    const width = sceneRef.current?.clientWidth ?? window.innerWidth;
    const threshold = Math.max(SWIPE_MIN_PX, width * SWIPE_RATIO);
    const { x, y } = drag;
    setDrag({ x: 0, y: 0 });
    if (Math.abs(x) > threshold && Math.abs(x) > Math.abs(y)) {
      go(x < 0 ? 1 : -1);
      return;
    }
    if (y > CLOSE_DRAG_PX) {
      onClose();
      return;
    }
    // Короткое движение — это тап: переключаем масштаб.
    if (Math.abs(x) < 8 && Math.abs(y) < 8) toggleZoom();
  };

  const src = open ? images[index] : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: (t) => ({
          // Непрозрачно: даже пара процентов просвета давала читаемый текст
          // страницы под картинкой.
          bgcolor: t.palette.common.black,
          backgroundImage: "none",
        }),
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          gap={0.5}
          sx={(t) => ({ p: 1, color: t.palette.common.white, flexShrink: 0 })}
        >
          <Typography variant="body2" sx={{ ml: 1, fontVariantNumeric: "tabular-nums" }}>
            {images.length > 1 ? `${(index ?? 0) + 1} / ${images.length}` : ""}
          </Typography>
          <Box sx={{ ml: "auto", display: "flex", gap: 0.5 }}>
            {/* Лупа — только на телефоне: на большом экране картинка и так
                видна целиком, а увеличить её можно кликом по ней. */}
            <Tooltip title={zoom > 1 ? "Уменьшить" : "Увеличить"}>
              <IconButton
                onClick={toggleZoom}
                sx={{ color: "inherit", display: { xs: "inline-flex", md: "none" } }}
              >
                {zoom > 1 ? <ZoomOutOutlined /> : <ZoomInOutlined />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Открыть в новой вкладке">
              <IconButton
                component="a"
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "inherit" }}
              >
                <OpenInNewOutlined />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} aria-label="Закрыть" sx={{ color: "inherit" }}>
              <CloseOutlined />
            </IconButton>
          </Box>
        </Stack>

        <Box
          ref={sceneRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          sx={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            // Без этого браузер забирает горизонтальный жест себе.
            touchAction: "none",
            cursor: zoom > 1 ? "grab" : "zoom-in",
          }}
        >
          {src && (
            <Box
              component="img"
              src={src}
              alt=""
              draggable={false}
              sx={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                userSelect: "none",
                transform: `translate(${pan.x + drag.x}px, ${pan.y + drag.y}px) scale(${zoom})`,
                // Пока палец ведёт картинку — без анимации, иначе она
                // «догоняет» жест; после отпускания возврат плавный.
                transition: drag.x !== 0 || drag.y !== 0 ? "none" : "transform .18s ease",
              }}
            />
          )}

          {/* Стрелки — для мыши; пальцем листают свайпом. */}
          {images.length > 1 && (
            <>
              <IconButton
                onClick={() => go(-1)}
                disabled={(index ?? 0) === 0}
                aria-label="Предыдущая"
                sx={(t) => ({
                  position: "absolute",
                  left: 8,
                  color: t.palette.common.white,
                  display: { xs: "none", md: "inline-flex" },
                  "&.Mui-disabled": {
                    color: alpha(t.palette.common.white, 0.3),
                    // Погашенную кнопку MUI делает прозрачной для указателя —
                    // нажатие на крайнюю стрелку проваливалось бы в сцену.
                    pointerEvents: "auto",
                  },
                })}
              >
                <ChevronLeftOutlined />
              </IconButton>
              <IconButton
                onClick={() => go(1)}
                disabled={(index ?? 0) === images.length - 1}
                aria-label="Следующая"
                sx={(t) => ({
                  position: "absolute",
                  right: 8,
                  color: t.palette.common.white,
                  display: { xs: "none", md: "inline-flex" },
                  "&.Mui-disabled": {
                    color: alpha(t.palette.common.white, 0.3),
                    // Погашенную кнопку MUI делает прозрачной для указателя —
                    // нажатие на крайнюю стрелку проваливалось бы в сцену.
                    pointerEvents: "auto",
                  },
                })}
              >
                <ChevronRightOutlined />
              </IconButton>
            </>
          )}
        </Box>

        {/* Подсказка про жесты — только на телефоне: мышью листают стрелками. */}
        {images.length > 1 && (
          <Typography
            variant="caption"
            align="center"
            sx={(t) => ({
              color: alpha(t.palette.common.white, 0.6),
              pb: 1.5,
              flexShrink: 0,
              display: { xs: "block", md: "none" },
            })}
          >
            Свайп — следующая картинка, тап — увеличить
          </Typography>
        )}
      </Stack>
    </Dialog>
  );
};

export default ArticleLightbox;
