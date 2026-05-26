import React from 'react';
import { usePageCacheTyped } from '../../contexts/page-cache-context';
import { usePatientList } from './usePatientSearch';
import type { Patient } from '../../types/models';

/**
 * Типы для кешируемых данных страницы пациентов
 */
interface PatientSearchPageState {
  patients: Patient[];
  selectedPatient: Patient | null;
  query: string;
  hasMore: boolean;
  scrollPosition?: number;
}

/**
 * Hook с кешированием для страницы поиска пациентов
 * Сохраняет состояние при уходе со страницы и восстанавливает при возврате
 */
export function usePatientSearchWithCache() {
  const cache = usePageCacheTyped<PatientSearchPageState>('patient-search');

  // Загружаем кешированные данные ДО инициализации usePatientList
  const cached = cache.load();

  const patientList = usePatientList({
    initialPatients: cached?.patients,
    initialQuery: cached?.query ?? '',
    initialHasMore: cached?.hasMore ?? true,
    skipInitialFetch: !!cached, // Пропускаем fetch если есть кеш
  });

  const [selectedPatient, setSelectedPatient] = React.useState<Patient | null>(
    cached?.selectedPatient ?? null
  );

  // Сохранение в кеш при изменении состояния (с debounce для оптимизации)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  React.useEffect(() => {
    // Очищаем предыдущий таймаут
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Сохраняем с небольшой задержкой
    saveTimeoutRef.current = setTimeout(() => {
      cache.save({
        patients: patientList.patients,
        selectedPatient,
        query: patientList.query,
        hasMore: patientList.hasMore,
      });
    }, 100);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    patientList.patients,
    selectedPatient,
    patientList.query,
    patientList.hasMore,
  ]);

  return {
    ...patientList,
    selectedPatient,
    setSelectedPatient,
    cachedScrollPosition: cache.getScrollPosition(),
    saveScrollPosition: (position: number) => {
      const current = cache.load();
      if (current) {
        cache.save(current, position);
      }
    },
  };
}
