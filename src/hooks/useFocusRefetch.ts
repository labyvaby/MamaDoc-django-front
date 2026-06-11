import { useEffect, useRef } from "react";

/**
 * Перезапускает `refetch`, когда вкладка снова получает фокус/видимость
 * (с троттлингом). Нужен страницам с ручной загрузкой данных, чтобы два
 * кассира/регистратора видели изменения друг друга без полной перезагрузки.
 */
export function useFocusRefetch(refetch: () => void, throttleMs = 15_000) {
    const lastRunRef = useRef(Date.now());
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    useEffect(() => {
        const onFocus = () => {
            if (document.visibilityState !== "visible") return;
            const now = Date.now();
            if (now - lastRunRef.current < throttleMs) return;
            lastRunRef.current = now;
            refetchRef.current();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [throttleMs]);
}
