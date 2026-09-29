/**
 * Оболочка для глобальных виджетов клиники (объявления, тост онлайн-записи,
 * ачивки, напоминание СКУД): у отеля (Viva) они не монтируются вовсе — и не
 * шлют свои запросы. Одно место вместо проверок «это отель?» внутри каждого
 * виджета: новый клиничный виджет, обёрнутый сюда, отелю грузить не начнёт.
 *
 * Пока /auth/me/ не ответил, вертикаль неизвестна — ничего не монтируем:
 * иначе у отеля запросы клиники успевали уйти в первую же секунду и вставали в
 * одну очередь с отельными.
 */
import React from "react";

import { usePermissions } from "../../hooks/usePermissions";

export const ClinicOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeOrganization, loading } = usePermissions();
  if (loading || activeOrganization?.vertical === "hotel") return null;
  return <>{children}</>;
};

export default ClinicOnly;
