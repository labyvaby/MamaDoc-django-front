import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ZoomInOutlined from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlined from "@mui/icons-material/ZoomOutOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import BrokenImageOutlined from "@mui/icons-material/BrokenImageOutlined";

import { isCleaningBackdated, type CleaningRecord } from "../../api/cleaning";
import { formatCleaningCreatedAt, formatCleaningDate } from "./recordDate";

interface PhotoViewerDialogProps {
  /** null — диалог закрыт. */
  record: CleaningRecord | null;
  initialIndex: number;
  canManage: boolean;
  onClose: () => void;
  onApprove: (record: CleaningRecord) => void;
  onReject: (record: CleaningRecord) => void;
}

/** Масштабы по кругу: клик по фото / кнопка зума переключают между ними. */
const ZOOM_STEPS = [1, 2, 3] as const;
/** Порог свайпа — доля ширины сцены, после которой палец листает, а не отпускает назад. */
const SWIPE_RATIO = 0.18;
/** Минимум в пикселях, чтобы случайный сдвиг пальца при тапе не листал. */
const SWIPE_MIN_PX = 48;

/**
 * Просмотр фотоотчёта уборки: листание свайпом/стрелками/клавишами, зум с
 * перетаскиванием, лента миниатюр; для pending-записей — кнопки решения.
 *
 * Жесты сделаны на Pointer Events, а не на touch: они одинаково работают
 * пальцем и мышью, и — главное — фото не «уезжает» нативным drag-and-drop
 * картинки, из-за которого touch-свайп по изображению обрывался (touchend не
 * доходил до обработчика). `touchAction: none` на сцене нужен по той же
 * причине: без него браузер забирает горизонтальный жест себе.
 */
const PhotoViewerDialog: React.FC<PhotoViewerDialogProps> = ({
  record,
  initialIndex,
  canManage,
  onClose,
  onApprove,
  onReject,
}) => {
  const theme = useTheme();
  // Граница по md: телефон попадает в брейкпоинт sm (360px), поэтому «мобильный»
  // режим включаем по 768 — иначе планшетная вёрстка досталась бы телефону.
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  // Стабильная ссылка: массив уходит в зависимости эффекта предзагрузки, и
  // `?? []` пересоздавал бы его на каждый рендер (в т.ч. на каждый кадр свайпа).
  const photos = React.useMemo(() => record?.photos ?? [], [record]);
  const count = photos.length;

  const [index, setIndex] = React.useState(initialIndex);
  const safeIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = photos[safeIndex] ?? null;

  // Зум и панорамирование действуют на одно фото — при листании сбрасываются.
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [drag, setDrag] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "error">("loading");

  const sceneRef = React.useRef<HTMLDivElement | null>(null);
  const thumbsRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<{ x: number; y: number; pointerId: number; pan: boolean } | null>(
    null,
  );

  const resetZoom = React.useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, []);

  // Сброс на выбранное фото при каждом открытии.
  React.useEffect(() => {
    setIndex(initialIndex);
    resetZoom();
  }, [record, initialIndex, resetZoom]);

  const goTo = React.useCallback(
    (next: number) => {
      setIndex((i) => {
        const target = Math.min(Math.max(next, 0), Math.max(0, count - 1));
        return target === i ? i : target;
      });
      resetZoom();
    },
    [count, resetZoom],
  );
  const prev = React.useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);
  const next = React.useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);

  // Спиннер до загрузки конкретного файла: фото с телефона весит мегабайты, и
  // без индикатора переход выглядит как зависший белый прямоугольник.
  React.useEffect(() => {
    setLoadState("loading");
  }, [current?.url]);

  // Предзагрузка соседей — листание вперёд/назад без ожидания сети.
  React.useEffect(() => {
    for (const i of [safeIndex - 1, safeIndex + 1]) {
      const url = photos[i]?.url;
      if (!url) continue;
      const img = new Image();
      img.src = url;
    }
  }, [photos, safeIndex]);

  // Активная миниатюра — в центр ленты. Скроллим сам контейнер, а не
  // scrollIntoView: последний утащил бы за собой и диалог целиком.
  React.useEffect(() => {
    const box = thumbsRef.current;
    const item = box?.querySelector<HTMLElement>(`[data-idx="${safeIndex}"]`);
    if (!box || !item) return;
    box.scrollTo({
      left: item.offsetLeft - box.clientWidth / 2 + item.clientWidth / 2,
      behavior: "smooth",
    });
  }, [safeIndex]);

  /** Границы панорамирования: дальше края увеличенного фото тянуть некуда. */
  const clampOffset = React.useCallback(
    (x: number, y: number, scale: number) => {
      const box = sceneRef.current;
      if (!box || scale <= 1) return { x: 0, y: 0 };
      const maxX = (box.clientWidth * (scale - 1)) / 2;
      const maxY = (box.clientHeight * (scale - 1)) / 2;
      return {
        x: Math.min(Math.max(x, -maxX), maxX),
        y: Math.min(Math.max(y, -maxY), maxY),
      };
    },
    [],
  );

  const cycleZoom = React.useCallback(() => {
    const at = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const nextZoom = ZOOM_STEPS[(at + 1) % ZOOM_STEPS.length];
    setZoom(nextZoom);
    setOffset((o) => clampOffset(o.x, o.y, nextZoom));
  }, [zoom, clampOffset]);

  // ── Жесты ───────────────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    if (count === 0) return;
    gestureRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, pan: zoom > 1 };
    setDragging(true);
    // Захват указателя нужен, чтобы жест не терялся при выходе за края сцены.
    // Не во всех браузерах он доступен для любого типа указателя — падать из-за
    // этого нельзя, иначе оборвётся сам свайп.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* захват недоступен — жест отработает по событиям самой сцены */
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.pan) {
      setDrag({ x: dx, y: dy });
      return;
    }
    // На краях подборки — сопротивление: жест виден, но никуда не листает.
    const atEdge = (dx > 0 && safeIndex === 0) || (dx < 0 && safeIndex === count - 1);
    setDrag({ x: atEdge ? dx / 4 : dx, y: 0 });
  };

  const endGesture = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    setDragging(false);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    if (g.pan) {
      setOffset((o) => clampOffset(o.x + dx, o.y + dy, zoom));
      setDrag({ x: 0, y: 0 });
      return;
    }
    setDrag({ x: 0, y: 0 });
    const width = sceneRef.current?.clientWidth ?? 0;
    const threshold = Math.max(SWIPE_MIN_PX, width * SWIPE_RATIO);
    // Вертикальный жест — это скролл страницы под диалогом, не листание.
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
      return;
    }
    // Короткий жест = тап/клик по фото: переключаем масштаб.
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) cycleZoom();
  };

  const showArrows = count > 1;
  const scale = zoom;
  const translateX = offset.x + drag.x;
  const translateY = offset.y + drag.y;

  const arrowSx = {
    position: "absolute" as const,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 2,
    color: "common.white",
    bgcolor: alpha(theme.palette.common.black, 0.4),
    "&:hover": { bgcolor: alpha(theme.palette.common.black, 0.6) },
    "&.Mui-disabled": { color: alpha(theme.palette.common.white, 0.3) },
  };

  return (
    <Dialog
      open={record !== null}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={fullScreen}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
        if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "0") cycleZoom();
      }}
      PaperProps={{
        sx: { bgcolor: "background.paper", ...(fullScreen ? {} : { borderRadius: 2 }) },
      }}
    >
      {record && (
        <Stack sx={{ height: fullScreen ? "100%" : "auto", minHeight: 0 }}>
          {/* Шапка: что за уборка, счётчик и управление просмотром */}
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={600} noWrap>
                {record.typeName} · {formatCleaningDate(record)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {record.employeeName} · фото {safeIndex + 1} из {count}
                {isCleaningBackdated(record) && ` · запись создана ${formatCleaningCreatedAt(record)}`}
              </Typography>
            </Box>
            <Tooltip title={zoom > 1 ? "Уменьшить" : "Увеличить"}>
              <IconButton size="small" onClick={cycleZoom}>
                {zoom > 1 ? <ZoomOutOutlined /> : <ZoomInOutlined />}
              </IconButton>
            </Tooltip>
            {current && (
              <Tooltip title="Открыть оригинал">
                <IconButton
                  size="small"
                  component="a"
                  href={current.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <OpenInNewOutlined />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Закрыть">
              <IconButton size="small" onClick={onClose}>
                <CloseOutlined />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Сцена с фото */}
          <Box
            ref={sceneRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            sx={{
              position: "relative",
              flex: fullScreen ? 1 : "none",
              height: fullScreen ? "auto" : "min(68vh, 620px)",
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              // Жест забираем себе целиком: иначе браузер сначала попробует
              // проскроллить страницу и оборвёт свайп.
              touchAction: "none",
              userSelect: "none",
              bgcolor: alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.5 : 0.9),
              cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
            }}
          >
            {loadState === "loading" && (
              <CircularProgress size={28} sx={{ position: "absolute", color: "common.white" }} />
            )}
            {loadState === "error" && (
              <Stack alignItems="center" gap={1} sx={{ color: "common.white", position: "absolute" }}>
                <BrokenImageOutlined />
                <Typography variant="caption">Фото не загрузилось</Typography>
              </Stack>
            )}
            {current && (
              <Box
                component="img"
                key={current.url}
                src={current.url}
                alt={`Фото ${safeIndex + 1}`}
                draggable={false}
                onLoad={() => setLoadState("ready")}
                onError={() => setLoadState("error")}
                sx={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                  transition: dragging ? "none" : "transform .2s ease, opacity .2s ease",
                  opacity: loadState === "ready" ? 1 : 0,
                  pointerEvents: "none",
                }}
              />
            )}

            {showArrows && (
              <>
                <IconButton
                  onClick={prev}
                  disabled={safeIndex === 0}
                  aria-label="Предыдущее фото"
                  sx={{ ...arrowSx, left: 8 }}
                >
                  <ChevronLeftOutlined />
                </IconButton>
                <IconButton
                  onClick={next}
                  disabled={safeIndex === count - 1}
                  aria-label="Следующее фото"
                  sx={{ ...arrowSx, right: 8 }}
                >
                  <ChevronRightOutlined />
                </IconButton>
              </>
            )}
          </Box>

          {/* Лента миниатюр: при 10–15 фото точками уже не попасть в нужное */}
          {count > 1 && (
            <Stack
              ref={thumbsRef}
              direction="row"
              gap={0.75}
              sx={{
                px: 2,
                py: 1.25,
                overflowX: "auto",
                borderTop: 1,
                borderColor: "divider",
                "&::-webkit-scrollbar": { height: 6 },
                "&::-webkit-scrollbar-thumb": {
                  bgcolor: "action.disabled",
                  borderRadius: 3,
                },
              }}
            >
              {photos.map((photo, i) => (
                <Box
                  key={photo.id}
                  data-idx={i}
                  component="img"
                  src={photo.url}
                  alt={`Фото ${i + 1}`}
                  draggable={false}
                  onClick={() => goTo(i)}
                  sx={{
                    width: 56,
                    height: 56,
                    flexShrink: 0,
                    objectFit: "cover",
                    borderRadius: 1,
                    cursor: "pointer",
                    border: 2,
                    borderColor: i === safeIndex ? "primary.main" : "divider",
                    opacity: i === safeIndex ? 1 : 0.7,
                    transition: "opacity .15s ease, border-color .15s ease",
                    "&:hover": { opacity: 1 },
                  }}
                />
              ))}
            </Stack>
          )}

          {canManage && record.status === "pending" && (
            <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
              <Button
                color="error"
                onClick={() => {
                  onReject(record);
                  onClose();
                }}
              >
                Отклонить
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => {
                  onApprove(record);
                  onClose();
                }}
              >
                Подтвердить
              </Button>
            </DialogActions>
          )}
        </Stack>
      )}
    </Dialog>
  );
};

export default PhotoViewerDialog;
