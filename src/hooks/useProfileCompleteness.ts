import { useState, useEffect, useMemo, useCallback } from "react";
import { usePermissions } from "./usePermissions";
import { getCurrentUser, DjangoUser } from "../api/auth";
import { useLocation } from "react-router";

export type MissingFieldItem = {
  key: string;
  label: string;
  isCritical: boolean;
};

/**
 * Ключ отказа от напоминания. Раньше в него входила дата — баннер возвращался
 * каждый день, и закрыть его насовсем было нельзя (жалоба 19.08.2026).
 * Теперь закрытие постоянное: профиль остаётся доступен со страницы /profile.
 */
function dismissKey(userId: string): string {
  return `profile_reminder_dismissed_${userId}`;
}

export function useProfileCompleteness() {
  const { activeEmployee, employee: permEmp, employeeId } = usePermissions();
  const location = useLocation();

  const [djangoUser, setDjangoUser] = useState<DjangoUser | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  const emp = activeEmployee || permEmp;
  const userId = employeeId || (emp?.id ? String(emp.id) : "user");
  const storageKey = dismissKey(userId);

  // Check dismissal state in localStorage
  useEffect(() => {
    try {
      const val = localStorage.getItem(storageKey);
      setDismissed(val === "true");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  useEffect(() => {
    let isMounted = true;
    getCurrentUser()
      .then((me) => {
        if (isMounted && me?.user) {
          setDjangoUser(me.user);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const dismissReminder = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "true");
      setDismissed(true);
    } catch {
      // Safe fallback
      setDismissed(true);
    }
  }, [storageKey]);

  const { criticalMissing, decorMissing } = useMemo(() => {
    const critical: MissingFieldItem[] = [];
    const decor: MissingFieldItem[] = [];

    // 1. Email (Critical)
    const email = emp?.email || djangoUser?.email;
    if (!email || !email.trim()) {
      critical.push({ key: "email", label: "Email", isCritical: true });
    }

    // 2. Full Name (Critical)
    const name = emp?.fullName || [djangoUser?.firstName, djangoUser?.lastName].filter(Boolean).join(" ");
    if (!name || !name.trim()) {
      critical.push({ key: "fullName", label: "ФИО", isCritical: true });
    }

    // 3. Phone (Critical)
    const phone = emp?.phone;
    if (!phone || !phone.trim()) {
      critical.push({ key: "phone", label: "Телефон", isCritical: true });
    }

    // 4. Банковский счёт — НЕ критичный.
    // Заказчик 19.08.2026: врача пугает, что программа «просит данные банковской
    // карты». Счёт нужен бухгалтерии для выплат, а не для работы в системе,
    // поэтому он остаётся подсказкой в профиле и не поднимает баннер.
    const bank = emp?.bankAccountNumber;
    if (!bank || !bank.trim()) {
      decor.push({ key: "bank", label: "Банковский счёт", isCritical: false });
    }

    // 5. Photo (Decorative / Optional)
    const photo = emp?.photoUrl;
    if (!photo || !photo.trim()) {
      decor.push({ key: "photo", label: "Фото профиля", isCritical: false });
    }

    // 6. Telegram ID (Decorative / Optional)
    const telegram = emp?.telegramId;
    if (!telegram || !telegram.trim()) {
      decor.push({ key: "telegram", label: "Telegram ID", isCritical: false });
    }

    return { criticalMissing: critical, decorMissing: decor };
  }, [emp, djangoUser]);

  const hasCriticalMissing = criticalMissing.length > 0;
  const isProfilePage = location.pathname === "/profile";

  const shouldShowBanner =
    hasCriticalMissing &&
    !dismissed &&
    !isProfilePage;

  const criticalLabelsFormatted = criticalMissing.map((item) => item.label).join(", ");

  return {
    criticalMissing,
    decorMissing,
    hasCriticalMissing,
    shouldShowBanner,
    criticalLabelsFormatted,
    dismissed,
    dismissReminder,
  };
}
