const jalaali = require("jalaali-js");

/**
 * Convert a JavaScript Date or PostgreSQL date value
 * into a Solar Hijri date object.
 */
function dateToJalaali(date) {
  const d = date instanceof Date ? date : new Date(date);

  return jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * Convert Solar Hijri date to JavaScript Date.
 *
 * Accepts:
 *   jalaaliToDate(1405, 6, 26)
 */
function jalaaliToDate(year, month, day) {
  if (!jalaali.isValidJalaaliDate(year, month, day)) {
    throw new Error("Invalid Solar Hijri date");
  }

  const result = jalaali.toGregorian(year, month, day);

  return new Date(result.gy, result.gm - 1, result.gd);
}

/**
 * Parse a Solar Hijri date string.
 *
 * Accepts:
 *   1405/06/26
 *   1405-06-26
 *
 * Returns:
 *   {
 *     year: 1405,
 *     month: 6,
 *     day: 26
 *   }
 */
function parseSolarDate(value) {
  if (typeof value !== "string") {
    throw new Error("Solar Hijri date must be a string");
  }

  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (!match) {
    throw new Error("Invalid Solar Hijri date. Expected YYYY/MM/DD");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!jalaali.isValidJalaaliDate(year, month, day)) {
    throw new Error("Invalid Solar Hijri date");
  }

  return {
    year,
    month,
    day,
  };
}

/**
 * Get the number of days in a Solar Hijri month.
 */
function getJalaaliMonthDays(year, month) {
  if (month >= 1 && month <= 6) {
    return 31;
  }

  if (month >= 7 && month <= 11) {
    return 30;
  }

  if (month === 12) {
    return jalaali.isLeapJalaaliYear(year) ? 30 : 29;
  }

  throw new Error("Invalid Solar Hijri month");
}

/**
 * Format a Solar Hijri date.
 *
 * Example:
 *   formatJalaali(1405, 6, 26)
 *
 * Returns:
 *   1405/06/26
 */
function formatJalaali(year, month, day) {
  return `${String(year).padStart(4, "0")}/${String(month).padStart(
    2,
    "0",
  )}/${String(day).padStart(2, "0")}`;
}

/**
 * Alias used by the fee-period module.
 */
function formatSolarDate(year, month, day) {
  return formatJalaali(year, month, day);
}

module.exports = {
  dateToJalaali,
  jalaaliToDate,
  parseSolarDate,
  getJalaaliMonthDays,
  formatJalaali,
  formatSolarDate,
};
