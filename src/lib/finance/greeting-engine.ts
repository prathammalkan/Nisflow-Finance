export interface GreetingContext {
  displayName: string;
  hour: number; // 0-23
  availableCash: number;
  thisMonthIncome: number;
  thisMonthExpenses: number;
  todaySpent: number;
  budgetTotal: number;
  budgetSpent: number;
  upcomingCount: number;
  savingsGoalProgress: number; // 0-100
  needsReviewCount: number;
  dayOfMonth: number;
  dayOfWeek: number; // 0=Sun
  totalAccounts: number;
}

export interface Greeting {
  primary: string; // e.g. "Good morning, Pratham"
  secondary: string; // e.g. "You're starting today with room to spend."
}

export function generateGreeting(ctx: GreetingContext): Greeting {
  const {
    displayName,
    hour,
    availableCash,
    thisMonthIncome,
    thisMonthExpenses,
    todaySpent,
    budgetTotal,
    budgetSpent,
    upcomingCount,
    savingsGoalProgress,
    needsReviewCount,
    dayOfMonth,
    dayOfWeek,
    totalAccounts,
  } = ctx;

  let primary = "";
  if (hour < 12) primary = `Good morning, ${displayName}`;
  else if (hour < 17) primary = `Good afternoon, ${displayName}`;
  else primary = `Good evening, ${displayName}`;

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isStartOfMonth = dayOfMonth <= 5;
  const isEndOfMonth = dayOfMonth >= 25;
  const budgetUtilization = budgetTotal > 0 ? budgetSpent / budgetTotal : 0;
  
  const variants: string[] = [];

  if (totalAccounts === 0) {
    variants.push("Welcome to NisFlow. Connect an account to get started.");
    variants.push("Ready to gain clarity on your finances?");
    variants.push("Take a moment to set up your first account.");
  } else {
    if (needsReviewCount > 0) {
      variants.push(`${needsReviewCount} item${needsReviewCount > 1 ? 's need' : ' needs'} your review.`);
      variants.push(`You have ${needsReviewCount} unreviewed transaction${needsReviewCount > 1 ? 's' : ''}.`);
      variants.push(`A quick review of ${needsReviewCount} item${needsReviewCount > 1 ? 's is' : ' is'} needed.`);
      variants.push(`There are ${needsReviewCount} transaction${needsReviewCount > 1 ? 's waiting' : ' waiting'} for your input.`);
      variants.push(`Take a moment to clear your ${needsReviewCount} review item${needsReviewCount > 1 ? 's' : ''}.`);
    }

    if (savingsGoalProgress >= 100) {
      variants.push("You've reached your savings goal.");
      variants.push("Savings goal achieved. Great work.");
    } else if (savingsGoalProgress > 80) {
      variants.push("You're getting close to your savings goal.");
      variants.push("Almost there with your savings target.");
    } else if (savingsGoalProgress > 0) {
      variants.push("Steady progress on your savings goals.");
      variants.push("Moving forward with your savings plan.");
    }

    if (budgetTotal > 0) {
      if (budgetUtilization > 1) {
        variants.push("You've exceeded your budget limits.");
        variants.push("A heavier month than planned.");
        variants.push("Spending has gone over budget.");
      } else if (budgetUtilization > 0.8) {
        variants.push("Nearing the edge of your budget.");
        variants.push("Pacing a bit heavy on your budget.");
        variants.push("Tightening up as the month proceeds.");
        if (isEndOfMonth) {
          variants.push("End of month approaching. Budget looking healthy.");
          variants.push("Closing out the month on budget.");
        }
      } else if (budgetUtilization < 0.5 && isEndOfMonth) {
        variants.push("A notably lighter month than usual.");
        variants.push("Ending the month with plenty of room.");
      } else if (budgetUtilization < 0.5 && dayOfMonth > 15) {
        variants.push("You're having a lighter month than usual.");
        variants.push("Spending is keeping well within limits.");
      } else {
        variants.push("You're pacing well with your budget.");
        variants.push("Budget utilization is right on track.");
        variants.push("Spending remains balanced this month.");
        variants.push("Everything is proceeding as planned.");
      }
    }

    if (todaySpent === 0) {
      variants.push("Quiet day. Nothing spent yet.");
      variants.push("Starting today with a clean slate.");
      variants.push("No spending recorded for today.");
      if (hour > 18) {
        variants.push("A zero-spend day so far.");
      } else {
        variants.push("You're starting today with room to spend.");
        variants.push("A calm start to the day.");
      }
    } else if (todaySpent > 0) {
      variants.push("That was a heavier day, but you're still on track.");
      variants.push("Some activity today, keeping things moving.");
      variants.push("Daily spending logged.");
    }

    if (thisMonthIncome > 0 && isStartOfMonth) {
      variants.push("Your salary is in. Good time to give it a plan.");
      variants.push("New month, new income to direct.");
      variants.push("Income has arrived. Let's make it work.");
    }

    if (isWeekend) {
      variants.push("Weekend activity is steady.");
      variants.push("Enjoy the weekend, finances are tracking.");
      variants.push("A balanced weekend ahead.");
      variants.push("Weekend mode. Things are stable.");
      variants.push("Checking in over the weekend.");
    } else {
      variants.push("Mid-week check-in looks solid.");
      variants.push("Navigating the week with clarity.");
      variants.push("Weekday spending is tracking as expected.");
    }

    if (upcomingCount > 3) {
      variants.push("Several commitments coming up shortly.");
      variants.push("A busy few days ahead for your accounts.");
      variants.push("Prepare for upcoming recurring items.");
    } else if (upcomingCount > 0) {
      variants.push("A few regular items coming up.");
      variants.push("Upcoming commitments are manageable.");
    } else {
      variants.push("No immediate commitments on the horizon.");
      variants.push("A quiet stretch for upcoming bills.");
      variants.push("Clear runway ahead for a few days.");
    }

    if (availableCash < 0) {
      variants.push("Available balances require attention.");
      variants.push("Liquidity is running tight.");
      variants.push("Time to review cash flow.");
    } else if (availableCash < 500) {
      variants.push("Operating lean right now.");
      variants.push("Balances are currently modest.");
      variants.push("Keep an eye on short-term liquidity.");
    } else {
      variants.push("Healthy liquidity maintains your baseline.");
      variants.push("Reserves look stable today.");
      variants.push("Cash flow is currently reliable.");
      variants.push("Solid foundation to work from today.");
      variants.push("Adequate resources for your plans.");
    }

    variants.push("Finances are organized and up to date.");
    variants.push("Your financial picture is clear today.");
    variants.push("Everything is neatly categorized.");
    variants.push("A good moment to reflect on your plans.");
    variants.push("Staying aligned with your financial targets.");
    variants.push("Momentum is steady this month.");
    variants.push("Tracking smoothly along your projections.");
    variants.push("You are maintaining good financial habits.");
    variants.push("Consistency is building a solid base.");
    variants.push("A standard day in your financial timeline.");
    variants.push("Reviewing your current financial state.");
    variants.push("Things are quietly progressing.");
    variants.push("Your system is running smoothly.");
    variants.push("All systems indicate stable conditions.");
  }

  if (variants.length === 0) {
    variants.push("Things are looking steady today.");
    variants.push("Your financial picture is up to date.");
  }

  const seedString = `${displayName}-${hour}-${dayOfMonth}`;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = ((hash << 5) - hash) + seedString.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % variants.length;
  const secondary = variants[index];

  return { primary, secondary };
}
