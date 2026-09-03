import Decimal from 'decimal.js';

export interface CashFlow {
  amount: number; // Negative for investments (outflows), Positive for current value/withdrawals (inflows)
  date: Date;
}

/**
 * Calculates the Extended Internal Rate of Return (XIRR) for irregular cash flows.
 * @param cashFlows Array of CashFlow objects
 * @param guess Initial guess for the rate (default 10%)
 * @returns The XIRR as a decimal (e.g. 0.15 for 15%), or null if calculation fails
 */
export function calculateXIRR(cashFlows: CashFlow[], guess: number = 0.1): number | null {
  if (cashFlows.length < 2) return null;

  // Ensure there's at least one positive and one negative cash flow
  const hasPositive = cashFlows.some(cf => cf.amount > 0);
  const hasNegative = cashFlows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  // Sort cash flows by date
  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sortedFlows[0].date.getTime();

  // Helper function to calculate NPV (Net Present Value)
  const npv = (rate: number): number => {
    return sortedFlows.reduce((acc, cf) => {
      const days = (cf.date.getTime() - t0) / (1000 * 60 * 60 * 24);
      const years = days / 365.0;
      return acc + cf.amount / Math.pow(1 + rate, years);
    }, 0);
  };

  // Helper function to calculate derivative of NPV
  const dNpv = (rate: number): number => {
    return sortedFlows.reduce((acc, cf) => {
      const days = (cf.date.getTime() - t0) / (1000 * 60 * 60 * 24);
      const years = days / 365.0;
      if (years === 0) return acc;
      return acc - (cf.amount * years) / Math.pow(1 + rate, years + 1);
    }, 0);
  };

  // Newton-Raphson method
  let rate = guess;
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    const fx = npv(rate);
    if (Math.abs(fx) < tolerance) {
      return rate;
    }

    const dfx = dNpv(rate);
    if (Math.abs(dfx) < 1e-10) {
      // Derivative is too close to zero, Newton-Raphson fails
      break;
    }

    const nextRate = rate - fx / dfx;
    
    // Prevent rate from going below -100%
    if (nextRate <= -1) {
      rate = -0.99999;
    } else {
      rate = nextRate;
    }
    
    // If change is minimal, we've converged
    if (Math.abs(nextRate - rate) < tolerance) {
        return rate;
    }
  }

  // If Newton-Raphson fails, fallback to bisection method
  let low = -0.99999;
  let high = 10.0; // Assume max 1000% return
  
  if (npv(low) * npv(high) > 0) return null; // Root not bracketed

  for (let i = 0; i < maxIterations; i++) {
    rate = (low + high) / 2;
    const fx = npv(rate);
    
    if (Math.abs(fx) < tolerance) {
      return rate;
    }
    
    if (npv(low) * fx < 0) {
      high = rate;
    } else {
      low = rate;
    }
  }

  return rate;
}

/**
 * Convenience wrapper for decimal.js
 */
export function calculateXIRRDecimal(cashFlows: CashFlow[]): Decimal | null {
    const rate = calculateXIRR(cashFlows);
    return rate !== null ? new Decimal(rate) : null;
}
