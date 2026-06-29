import React from "react";
import { Drawer, type DrawerProps, Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";

/**
 * Единый bottom sheet для всего приложения.
 *
 * Правила:
 * - anchor всегда "bottom"
 * - ОДНА высота логики: content-based + max-height через viewport-токен
 *   (theme.appLayout.drawer.bottomSheet.height)
 * - ОДНА анимация (стандартный MUI Drawer transition)
 * - ОДИН жест закрытия свайпом вниз при scrollTop <= 0
 */

export type AppBottomSheetProps = Omit<DrawerProps, "anchor" | "open" | "onClose"> & {
  open: boolean;
  onClose: () => void;
  /**
   * Необязательный header-слот (например, Tabs).
   * Рендерится под ручкой и над скроллируемым контентом.
   */
  header?: React.ReactNode;

  /**
   * Основной скроллируемый контент.
   */
  children: React.ReactNode;
};

export const AppBottomSheet: React.FC<AppBottomSheetProps> = ({
  open,
  onClose,
  header,
  children,
  PaperProps,
  ModalProps,
  ...rest
}) => {
  // Fix for background scroll on mobile
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
    };
  }, [open]);

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const target = e.currentTarget as HTMLElement;
    const startY = e.touches[0].clientY;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const currentY = moveEvent.touches[0].clientY;
      const diff = currentY - startY;
      const scrollable = target.querySelector("[data-scrollable]") as HTMLElement | null;

      // Закрываем только если тянем вниз и контент прокручен в самый верх (или scrollable отсутствует)
      if (diff > 0 && (!scrollable || scrollable.scrollTop <= 0)) {
        // Only prevent default if we are reasonably sure it's a drag attempt, 
        // but to prevent native scroll bouncing we usually need to capture early.
        // However, let's keep preventDefault to avoid overscroll indicators.
        moveEvent.preventDefault();

        // Increased threshold to 150 to avoid accidental closing
        if (diff > 150) {
          onClose();
          target.removeEventListener("touchmove", handleTouchMove);
          target.removeEventListener("touchend", handleTouchEnd);
        }
      }
    };

    const handleTouchEnd = () => {
      target.removeEventListener("touchmove", handleTouchMove);
      target.removeEventListener("touchend", handleTouchEnd);
    };

    target.addEventListener("touchmove", handleTouchMove, { passive: false });
    target.addEventListener("touchend", handleTouchEnd);
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      disableScrollLock={false}
      disableEnforceFocus
      disableRestoreFocus
      ModalProps={{
        keepMounted: true,
        ...(ModalProps ?? {}),
      }}
      PaperProps={{
        ...(PaperProps ?? {}),
        sx: (theme) => ({
          maxHeight: theme.appLayout.drawer.bottomSheet.height,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          // touchAction: "none" removed to allow internal content scrolling
          ...(typeof PaperProps?.sx === "function"
            ? PaperProps.sx(theme)
            : (PaperProps?.sx as object | undefined)),
        }),
        onTouchStart: handleTouchStart,
      }}
      {...rest}
    >
      {/* Ручка для свайпа */}
      <Box
        sx={{
          pt: 1.5,
          pb: 1,
          display: "flex",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "grab",
        }}
      >
        <Box
          sx={(theme) => ({
            width: theme.appLayout.drawer.bottomSheet.handleWidth,
            height: theme.appLayout.drawer.bottomSheet.handleHeight,
            bgcolor: "grey.300",
            borderRadius: theme.appLayout.drawer.bottomSheet.handleRadius,
          })}
        />
      </Box>

      {/* Кнопка закрытия (крестик) */}
      <Box sx={{ position: "absolute", top: 12, right: 12, zIndex: 1 }}>
        <IconButton size="small" onClick={() => onClose()}>
          <CloseIcon />
        </IconButton>
      </Box>

      {header}

      {/* Скроллируемая область */}
      <Box
        data-scrollable
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children}
      </Box>
    </Drawer>
  );
};

export default AppBottomSheet;
