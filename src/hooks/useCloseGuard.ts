import { useState, useCallback, useEffect } from "react";

/**
 * Хук для защиты закрытия drawer/modal с несохранёнными данными.
 * Перехватывает: клик на крестик, клик вне drawer, кнопки назад/вперёд браузера, закрытие вкладки.
 */
export function useCloseGuard({
    isDirty,
    isOpen = true,
    onClose,
}: {
    isDirty: boolean;
    isOpen?: boolean;
    onClose: () => void;
}) {
    const [open, setOpen] = useState(false);

    // Предупреждение при закрытии вкладки / браузера
    useEffect(() => {
        if (!isOpen || !isDirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [isOpen, isDirty]);

    // Перехват кнопок назад/вперёд через popstate
    useEffect(() => {
        if (!isOpen || !isDirty) return;

        // Добавляем фиктивную запись в историю чтобы кнопка "назад" не уходила со страницы
        window.history.pushState({ guardedDrawer: true }, "");

        const handler = (_e: PopStateEvent) => {
            // Показываем нашу модалку вместо перехода
            setOpen(true);
            // Снова добавляем запись чтобы следующее нажатие "назад" тоже перехватилось
            window.history.pushState({ guardedDrawer: true }, "");
        };

        window.addEventListener("popstate", handler);
        return () => {
            window.removeEventListener("popstate", handler);
            // Убираем фиктивную запись при размонтировании
            if (window.history.state?.guardedDrawer) {
                window.history.back();
            }
        };
    }, [isOpen, isDirty]);

    // Вызывается когда пользователь пытается закрыть через UI
    const guardedClose = useCallback(() => {
        if (isDirty) {
            setOpen(true);
        } else {
            onClose();
        }
    }, [isDirty, onClose]);

    // Подтверждение — закрыть без сохранения
    const confirmClose = useCallback(() => {
        setOpen(false);
        onClose();
    }, [onClose]);

    // Отмена — остаться
    const cancelClose = useCallback(() => {
        setOpen(false);
    }, []);

    return { guardedClose, confirmOpen: open, confirmClose, cancelClose };
}
