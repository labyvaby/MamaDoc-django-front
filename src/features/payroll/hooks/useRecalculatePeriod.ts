import { useState } from 'react';
import { recalculateLockedPeriod } from '../lockPeriod';
import { serializeSnapshotPayload } from '../serializeSnapshotPayload';
import { CURRENT_SNAPSHOT_VERSION } from '../types';
import type { SnapshotInput } from '../types';

export function useRecalculatePeriod() {
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recalculate(params: {
    periodId: string;
    reason: string;
    salaryData: Array<{
      id: string;
      salary_rules: any;
      total_salary: number;
      day_hours: number;
      night_hours: number;
      appointments_count: number;
      expenses_sum: number;
      hours_sum: number;
      percent_sum: number;
      [key: string]: any;
    }>;
  }): Promise<boolean> {
    setRecalculating(true);
    setError(null);

    try {
      const calculatedAt = new Date().toISOString();

      const snapshots: SnapshotInput[] = params.salaryData.map(row => ({
        employee_id:        row.id,
        total_salary:       row.total_salary,
        total_hours:        row.day_hours + row.night_hours,
        total_appointments: row.appointments_count,
        total_expenses:     row.expenses_sum,
        hours_pay:          row.hours_sum,
        percent_pay:        row.percent_sum,
        payload: serializeSnapshotPayload(
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
        ),
        calculated_at: calculatedAt,
      }));

      await recalculateLockedPeriod({
        periodId:        params.periodId,
        reason:          params.reason,
        snapshots,
        snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      });

      return true;
    } catch (err: any) {
      setError(err?.message ?? 'Ошибка пересчёта');
      return false;
    } finally {
      setRecalculating(false);
    }
  }

  return { recalculate, recalculating, error };
}
