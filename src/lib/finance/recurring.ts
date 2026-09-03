import { addDays, addWeeks, addMonths, addYears } from 'date-fns';

/**
 * Calculates the next due date based on frequency.
 */
export function calculateNextDueDate(current: Date, frequency: string): Date {
  switch (frequency) {
    case 'daily': return addDays(current, 1);
    case 'weekly': return addWeeks(current, 1);
    case 'monthly': return addMonths(current, 1);
    case 'quarterly': return addMonths(current, 3);
    case 'yearly': return addYears(current, 1);
    default: return addMonths(current, 1);
  }
}
