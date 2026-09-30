/**
 * Предзагрузка кода самых ходовых страниц клиники в простое браузера. Раньше
 * жила в App.tsx и срабатывала у всех при старте — в том числе у отеля, где
 * эти страницы не открывают: приёмы, услуги и карточка пациента (с генератором
 * PDF, ~1 МБ) качались параллельно с шахматкой и задерживали её. Теперь
 * компонент монтируется внутри ClinicOnly — только у клиники и только после
 * того, как /auth/me/ ответил. У отеля своя предзагрузка (prefetchHotelPages).
 */
import React from "react";

export const ClinicPagePrefetch: React.FC = () => {
  React.useEffect(() => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    const ric = w.requestIdleCallback;

    // Приоритет 1: самые часто используемые страницы.
    const prefetchPriority = () => {
      void import("../../pages/appointments/AppointmentsPage");
      void import("../../pages/employes");
    };
    // Приоритет 2: менее важные — позже.
    const prefetchSecondary = () => {
      void import("../../pages/services/DjangoServicesPage");
      void import("../../pages/patients/DjangoPatientsPage");
    };
    // Приоритет 3: редкие — в последнюю очередь.
    const prefetchTertiary = () => {
      void import("../../pages/settings/RolesSettingsPage");
    };

    if (typeof ric === "function") {
      ric(prefetchPriority);
      ric(() => {
        setTimeout(prefetchSecondary, 1000);
      });
      ric(() => {
        setTimeout(prefetchTertiary, 3000);
      });
    } else {
      setTimeout(prefetchPriority, 1500);
      setTimeout(prefetchSecondary, 3000);
      setTimeout(prefetchTertiary, 5000);
    }
  }, []);
  return null;
};

export default ClinicPagePrefetch;
