import { useState, useEffect, useMemo, useCallback } from "react";
import { usePermissions } from "./usePermissions";
import { getCurrentUser, DjangoUser } from "../api/auth";
import { IS_DJANGO_BACKEND } from "../config/backend";
import { useLocation } from "react-router";

export type MissingFieldItem = {
  key: string;
  label: string;
  isCritical: boolean;
};

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useProfileCompleteness() {
  const { activeEmployee, employee: permEmp, employeeId } = usePermissions();
  const location = useLocation();

  const [djangoUser, setDjangoUser] = useState<DjangoUser | null>(null);
  const [dismissedToday, setDismissedToday] = useState<boolean>(false);

  const emp = activeEmployee || permEmp;
  const userId = employeeId || (emp?.id ? String(emp.id) : "user");
  const todayStr = getTodayString();
  const storageKey = `profile_reminder_dismissed_${userId}_${todayStr}`;

  // Check dismissal state in localStorage
  useEffect(() => {
    try {
      const val = localStorage.getItem(storageKey);
      setDismissedToday(val === "true");
    } catch {
      setDismissedToday(false);
    }
  }, [storageKey]);

  // Load user profile details if in Django mode
  useEffect(() => {
    if (!IS_DJANGO_BACKEND) return;
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

  const dismissForToday = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "true");
      setDismissedToday(true);
    } catch {
      // Safe fallback
      setDismissedToday(true);
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

    // 4. Bank Account / INN (Critical)
    const bank = emp?.bankAccountNumber;
    if (!bank || !bank.trim()) {
      critical.push({ key: "bank", label: "Банковский счёт", isCritical: true });
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
    IS_DJANGO_BACKEND &&
    hasCriticalMissing &&
    !dismissedToday &&
    !isProfilePage;

  const criticalLabelsFormatted = criticalMissing.map((item) => item.label).join(", ");

  return {
    criticalMissing,
    decorMissing,
    hasCriticalMissing,
    shouldShowBanner,
    criticalLabelsFormatted,
    dismissedToday,
    dismissForToday,
  };
}
