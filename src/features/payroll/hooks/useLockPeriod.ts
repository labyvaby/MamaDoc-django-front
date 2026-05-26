import { useState } from 'react';
import dayjs from 'dayjs';
import { lockPeriod } from '../lockPeriod';
import { serializeSnapshotPayload } from '../serializeSnapshotPayload';
import { CURRENT_SNAPSHOT_VERSION } from '../types';
import type { SnapshotInput } from '../types';

interface EmployeeSalaryRow {
  id: string;
  salary_rules: any;
  total_salary: number;
  day_hours: number;
  night_hours: number;
  appointments_count: number;
  expenses_sum: number;
  hours_sum: number;
  percent_sum: number;
  day_hours_sum?: number;
  night_hours_sum?: number;
  distributed_appointments?: number;
  created_by_count?: number;
  total_count?: number;
  waiting_count?: number;
  cancelled_count?: number;
  discounted_count?: number;
  paid_count?: number;
  [key: string]: any;
}

export function useLockPeriod() {
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lock(params: {
    month: string;           // 'YYYY-MM-DD' — first day of month
    notes: string;
    salaryData: EmployeeSalaryRow[];
    calculatedAt?: string;   // ISO — when the live calc ran (defaults to now)
  }): Promise<string | null> {
    setLocking(true);
    setError(null);

    try {
      const monthFirst = dayjs(params.month).startOf('month').format('YYYY-MM-DD');
      const calculatedAt = params.calculatedAt ?? new Date().toISOString();

      const snapshots: SnapshotInput[] = params.salaryData.map(row => {
        const payload = serializeSnapshotPayload(
          row.salary_rules ?? {},
          {
            dayHours:                row.day_hours,
            nightHours:              row.night_hours,
            hoursSum:                row.hours_sum,
            dayHoursSum:             row.day_hours_sum ?? 0,
            nightHoursSum:           row.night_hours_sum ?? 0,
            distributedAppointments: row.distributed_appointments ?? 0,
            createdByCount:          row.created_by_count ?? 0,
            appointmentsCount:       row.appointments_count,
            percentSum:              row.percent_sum,
            totalCount:              row.total_count ?? 0,
            waitingCount:            row.waiting_count ?? 0,
            cancelledCount:          row.cancelled_count ?? 0,
            discountedCount:         row.discounted_count ?? 0,
            discountSum:             0,
            paidCount:               row.paid_count ?? 0,
            paidSum:                 0,
            expensesSum:             row.expenses_sum,
            totalSalary:             row.total_salary,
            hasWarning:              false,
          },
          [],
        );

        return {
          employee_id:        row.id,
          total_salary:       row.total_salary,
          total_hours:        row.day_hours + row.night_hours,
          total_appointments: row.appointments_count,
          total_expenses:     row.expenses_sum,
          hours_pay:          row.hours_sum,
          percent_pay:        row.percent_sum,
          payload,
          calculated_at:      calculatedAt,
        };
      });

      const periodId = await lockPeriod({
        month:           monthFirst,
        calcModel:       'legacy_v1',
        notes:           params.notes,
        snapshots,
        snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      });

      return periodId;
    } catch (err: any) {
      const msg = err?.message ?? 'Ошибка закрытия периода';
      setError(msg);
      return null;
    } finally {
      setLocking(false);
    }
  }

  return { lock, locking, error };
}
