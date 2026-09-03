import Decimal from 'decimal.js';

export interface AccountingPreviewLine {
  type: 'Dr' | 'Cr';
  accountName: string;
  accountRole: string; // e.g. 'Bank Asset', 'Expense', 'Receivable Asset', 'Loan Liability'
  amount: string;
  memo?: string;
}

export interface AccountingPreviewResult {
  title: string;
  lines: AccountingPreviewLine[];
  totalDebit: string;
  totalCredit: string;
  netWorthEffect: {
    amount: string;
    direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    description: string;
  };
}

/**
 * Server-side accounting effect generator.
 * Computes exact double-entry debits/credits and net worth impact from domain rules,
 * ensuring the LLM never determines accounting entries.
 */
export function generateAccountingPreview(params: {
  actionType: string;
  amount: number | string;
  sourceAccountName?: string;
  destAccountName?: string;
  personName?: string;
  loanName?: string;
  assetSymbol?: string;
  categoryName?: string;
  principalAmount?: number | string;
  interestAmount?: number | string;
  costBasis?: number | string;
  realizedGainLoss?: number | string;
  description?: string;
}): AccountingPreviewResult {
  const decAmount = new Decimal(params.amount || 0);
  const formattedAmount = decAmount.toFixed(2);
  const srcName = params.sourceAccountName || 'Bank Account';
  const destName = params.destAccountName || 'Destination Account';
  const personName = params.personName || 'Counterparty';
  const loanName = params.loanName || 'Loan';
  const assetName = params.assetSymbol || 'Investment Asset';
  const catName = params.categoryName || 'General Expense';

  switch (params.actionType) {
    case 'expense': {
      return {
        title: 'Expense Entry',
        lines: [
          { type: 'Dr', accountName: catName, accountRole: 'Expense', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: formattedAmount,
          direction: 'NEGATIVE',
          description: `Decreases liquid cash by ₹${formattedAmount}`,
        },
      };
    }

    case 'income': {
      return {
        title: 'Income Entry',
        lines: [
          { type: 'Dr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: params.categoryName || 'Income', accountRole: 'Income', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: formattedAmount,
          direction: 'POSITIVE',
          description: `Increases liquid cash by ₹${formattedAmount}`,
        },
      };
    }

    case 'transfer': {
      return {
        title: 'Inter-Account Transfer',
        lines: [
          { type: 'Dr', accountName: destName, accountRole: 'Destination Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: srcName, accountRole: 'Source Asset', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: 'No net worth change (Internal transfer between own accounts)',
        },
      };
    }

    case 'lending': {
      return {
        title: 'Lent Money (Receivable)',
        lines: [
          { type: 'Dr', accountName: `Receivable: ${personName}`, accountRole: 'Receivable Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: `Asset swap: Cash decreases by ₹${formattedAmount}, Receivable asset increases by ₹${formattedAmount}`,
        },
      };
    }

    case 'borrowing': {
      return {
        title: 'Borrowed Money (Payable)',
        lines: [
          { type: 'Dr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: `Payable: ${personName}`, accountRole: 'Payable Liability', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: `Cash received ₹${formattedAmount}, offset by equal debt liability owed to ${personName}`,
        },
      };
    }

    case 'receivable_repayment': {
      return {
        title: 'Receivable Repayment Received',
        lines: [
          { type: 'Dr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: `Receivable: ${personName}`, accountRole: 'Receivable Asset', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: `Receivable converted to cash: +₹${formattedAmount} bank, -₹${formattedAmount} debt owed by ${personName}`,
        },
      };
    }

    case 'payable_repayment': {
      return {
        title: 'Debt Repayment Paid',
        lines: [
          { type: 'Dr', accountName: `Payable: ${personName}`, accountRole: 'Payable Liability', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: `Paid off debt to ${personName}: -₹${formattedAmount} cash, -₹${formattedAmount} liability`,
        },
      };
    }

    case 'loan_emi': {
      const principal = new Decimal(params.principalAmount || decAmount);
      const interest = new Decimal(params.interestAmount || 0);
      const totalEMI = principal.plus(interest);

      return {
        title: 'Loan EMI Payment',
        lines: [
          { type: 'Dr', accountName: `Loan Liability: ${loanName}`, accountRole: 'Loan Liability', amount: principal.toFixed(2), memo: 'Principal Repayment' },
          { type: 'Dr', accountName: `Loan Interest: ${loanName}`, accountRole: 'Interest Expense', amount: interest.toFixed(2), memo: 'Interest Expense' },
          { type: 'Cr', accountName: srcName, accountRole: 'Bank Asset', amount: totalEMI.toFixed(2), memo: params.description },
        ],
        totalDebit: totalEMI.toFixed(2),
        totalCredit: totalEMI.toFixed(2),
        netWorthEffect: {
          amount: interest.toFixed(2),
          direction: interest.gt(0) ? 'NEGATIVE' : 'NEUTRAL',
          description: `Reduces loan principal by ₹${principal.toFixed(2)}, interest cost ₹${interest.toFixed(2)}`,
        },
      };
    }

    case 'investment_buy': {
      const dematName = params.destAccountName || 'Investment/Demat Account';
      return {
        title: 'Investment Purchase',
        lines: [
          { type: 'Dr', accountName: `${assetName} (${dematName})`, accountRole: 'Investment Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: `Portfolio asset swap: -₹${formattedAmount} cash, +₹${formattedAmount} ${assetName} securities`,
        },
      };
    }

    case 'investment_sell': {
      const proceeds = decAmount;
      const cost = params.costBasis !== undefined ? new Decimal(params.costBasis) : proceeds;
      const gainLoss = proceeds.minus(cost);

      const lines: AccountingPreviewLine[] = [
        { type: 'Dr', accountName: srcName, accountRole: 'Bank Asset', amount: proceeds.toFixed(2), memo: `${params.description} (Proceeds)` },
        { type: 'Cr', accountName: `${assetName} (Demat)`, accountRole: 'Investment Asset', amount: cost.toFixed(2), memo: `${params.description} (Cost Basis)` },
      ];

      if (gainLoss.gt(0)) {
        lines.push({ type: 'Cr', accountName: 'Realized Capital Gain', accountRole: 'Income', amount: gainLoss.toFixed(2), memo: 'Capital Gain' });
      } else if (gainLoss.lt(0)) {
        lines.push({ type: 'Dr', accountName: 'Realized Capital Loss', accountRole: 'Expense', amount: gainLoss.abs().toFixed(2), memo: 'Capital Loss' });
      }

      return {
        title: 'Investment Sale',
        lines,
        totalDebit: proceeds.gt(cost) ? proceeds.toFixed(2) : cost.toFixed(2),
        totalCredit: proceeds.gt(cost) ? proceeds.toFixed(2) : cost.toFixed(2),
        netWorthEffect: {
          amount: gainLoss.abs().toFixed(2),
          direction: gainLoss.gt(0) ? 'POSITIVE' : (gainLoss.lt(0) ? 'NEGATIVE' : 'NEUTRAL'),
          description: gainLoss.gt(0)
            ? `Realized capital gain of +₹${gainLoss.toFixed(2)}`
            : (gainLoss.lt(0) ? `Realized capital loss of -₹${gainLoss.abs().toFixed(2)}` : 'At-cost sale (no capital gain/loss)'),
        },
      };
    }

    case 'investment_dividend': {
      return {
        title: 'Dividend Income',
        lines: [
          { type: 'Dr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: `Dividend: ${assetName}`, accountRole: 'Income', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: formattedAmount,
          direction: 'POSITIVE',
          description: `Dividend income of +₹${formattedAmount}`,
        },
      };
    }

    case 'opening_balance': {
      return {
        title: 'Opening Balance Equity',
        lines: [
          { type: 'Dr', accountName: srcName, accountRole: 'Bank Asset', amount: formattedAmount, memo: params.description },
          { type: 'Cr', accountName: 'Opening Balance Equity', accountRole: 'Equity', amount: formattedAmount, memo: params.description },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: formattedAmount,
          direction: 'POSITIVE',
          description: `Establishes starting account equity of ₹${formattedAmount}`,
        },
      };
    }

    case 'reversal': {
      return {
        title: 'Reversal / Correction',
        lines: [
          { type: 'Dr', accountName: 'Offsetting Account', accountRole: 'Ledger Inversion', amount: formattedAmount, memo: 'Inverted lines' },
          { type: 'Cr', accountName: 'Original Account', accountRole: 'Ledger Inversion', amount: formattedAmount, memo: 'Inverted lines' },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: formattedAmount,
          direction: 'NEUTRAL',
          description: 'Restores balances prior to original transaction',
        },
      };
    }

    default: {
      return {
        title: 'Financial Transaction',
        lines: [
          { type: 'Dr', accountName: 'Ledger Account A', accountRole: 'Asset/Expense', amount: formattedAmount },
          { type: 'Cr', accountName: 'Ledger Account B', accountRole: 'Asset/Income', amount: formattedAmount },
        ],
        totalDebit: formattedAmount,
        totalCredit: formattedAmount,
        netWorthEffect: {
          amount: '0.00',
          direction: 'NEUTRAL',
          description: 'Double-entry transaction',
        },
      };
    }
  }
}
