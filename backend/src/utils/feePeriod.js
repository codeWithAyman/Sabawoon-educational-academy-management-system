const { jalaaliToDate, getJalaaliMonthDays } = require("./solarDate");

/**
 * Parse a Solar Hijri date string.
 *
 * Accepts:
 *   1405/06/26
 *   1405-06-26
 *
 * Returns both the Solar Hijri components and
 * the corresponding Gregorian Date.
 */
function parseSolarDate(value) {
  if (typeof value !== "string") {
    throw new Error("Solar Hijri date must be a string");
  }

  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (!match) {
    throw new Error("Invalid Solar Hijri date. Expected YYYY/MM/DD");
  }

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  if (!Number.isInteger(jy) || jy < 1) {
    throw new Error("Invalid Solar Hijri year");
  }

  if (!Number.isInteger(jm) || jm < 1 || jm > 12) {
    throw new Error("Invalid Solar Hijri month");
  }

  const monthDays = getJalaaliMonthDays(jy, jm);

  if (!Number.isInteger(jd) || jd < 1 || jd > monthDays) {
    throw new Error(
      `Invalid Solar Hijri day. Month ${jm} has ${monthDays} days`,
    );
  }

  const gregorianDate = jalaaliToDate(jy, jm, jd);

  return {
    jy,
    jm,
    jd,
    monthDays,
    gregorianDate,
  };
}

/**
 * Format a Solar Hijri date.
 *
 * Example:
 *   formatSolarDate(1405, 6, 26)
 *   => 1405/06/26
 */
function formatSolarDate(jy, jm, jd) {
  return `${String(jy).padStart(4, "0")}/${String(jm).padStart(
    2,
    "0",
  )}/${String(jd).padStart(2, "0")}`;
}

/**
 * Compare two Solar Hijri dates.
 *
 * Returns:
 *   -1 when first date is before second date
 *    0 when dates are equal
 *    1 when first date is after second date
 */
function compareSolarDates(first, second) {
  if (first.jy !== second.jy) {
    return first.jy < second.jy ? -1 : 1;
  }

  if (first.jm !== second.jm) {
    return first.jm < second.jm ? -1 : 1;
  }

  if (first.jd !== second.jd) {
    return first.jd < second.jd ? -1 : 1;
  }

  return 0;
}

/**
 * Move to the next Solar Hijri month.
 */
function nextSolarMonth(jy, jm) {
  if (jm >= 12) {
    return {
      jy: jy + 1,
      jm: 1,
    };
  }

  return {
    jy,
    jm: jm + 1,
  };
}

/**
 * Calculate the number of calendar days covered by a fee period.
 *
 * IMPORTANT:
 * This is ONLY date/coverage information.
 *
 * It does NOT calculate money from covered days.
 *
 * Financial amounts are kept at the actual payment amount and
 * are never reduced because a period starts/ends partway through
 * a Solar Hijri month.
 *
 * Example:
 *
 *   From: 1405/06/10
 *   To:   1405/06/20
 *   Monthly fee: 600
 *
 * Result:
 *   covered_days = 11
 *   monthly_amount = 600
 *   calculated_amount = 600
 *
 * The 11 covered days do NOT turn 600 into 220 or any other
 * prorated amount.
 *
 * For a range covering multiple months, every included month
 * carries the full monthly fee.
 */
function calculateFeePeriod(fromSolarDate, toSolarDate, monthlyAmount) {
  const start = parseSolarDate(fromSolarDate);
  const end = parseSolarDate(toSolarDate);

  if (compareSolarDates(start, end) > 0) {
    throw new Error("To date cannot be before from date");
  }

  const amount = Number(monthlyAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Monthly amount must be greater than zero");
  }

  /*
   * Keep money at normal currency precision.
   *
   * This does NOT perform any day-based calculation.
   */
  const normalizedAmount = Number(amount.toFixed(2));

  const months = [];

  let jy = start.jy;
  let jm = start.jm;

  while (jy < end.jy || (jy === end.jy && jm <= end.jm)) {
    const monthDays = getJalaaliMonthDays(jy, jm);

    const isFirstMonth = jy === start.jy && jm === start.jm;
    const isLastMonth = jy === end.jy && jm === end.jm;

    const rangeStart = isFirstMonth ? start.jd : 1;
    const rangeEnd = isLastMonth ? end.jd : monthDays;

    const coveredDays = rangeEnd - rangeStart + 1;

    if (coveredDays > 0) {
      months.push({
        solar_year: jy,
        solar_month: jm,
        month_days: monthDays,

        /*
         * These fields describe DATE COVERAGE only.
         */
        from_day: rangeStart,
        to_day: rangeEnd,
        covered_days: coveredDays,

        /*
         * Financial information.
         *
         * The full monthly amount is preserved.
         *
         * There is intentionally NO:
         *
         *   amount / monthDays * coveredDays
         *
         * calculation anymore.
         */
        monthly_amount: normalizedAmount,
        calculated_amount: normalizedAmount,
      });
    }

    const next = nextSolarMonth(jy, jm);

    jy = next.jy;
    jm = next.jm;
  }

  const coveredDays = months.reduce(
    (sum, month) => sum + month.covered_days,
    0,
  );

  /*
   * Total amount is simply the sum of the monthly fees for the
   * months included in the period.
   *
   * Example:
   *
   *   1 month  x 600 = 600
   *   2 months x 600 = 1200
   *   3 months x 600 = 1800
   *
   * It is NEVER based on covered days.
   */
  const totalAmount = Number(
    months.reduce((sum, month) => sum + month.monthly_amount, 0).toFixed(2),
  );

  return {
    from_solar_date: formatSolarDate(start.jy, start.jm, start.jd),
    to_solar_date: formatSolarDate(end.jy, end.jm, end.jd),

    from_date: start.gregorianDate,
    to_date: end.gregorianDate,

    covered_days: coveredDays,

    /*
     * Financial total based on included months,
     * NOT covered days.
     */
    total_amount: totalAmount,

    months,
  };
}

module.exports = {
  parseSolarDate,
  formatSolarDate,
  calculateFeePeriod,
};
