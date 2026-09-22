const jalaali = require("jalaali-js");

function dateToJalaali(date) {
  const d = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid Gregorian date");
  }

  return jalaali.toJalaali(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
  );
}

function jalaaliToDate(year, month, day) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (!jalaali.isValidJalaaliDate(numericYear, numericMonth, numericDay)) {
    throw new Error("Invalid Solar Hijri date");
  }

  const result = jalaali.toGregorian(numericYear, numericMonth, numericDay);

  // Keep the Gregorian date at noon UTC so timezone conversion
  // cannot move it to the previous or next calendar day.
  return new Date(Date.UTC(result.gy, result.gm - 1, result.gd, 12, 0, 0, 0));
}

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

  const gregorianDate = jalaaliToDate(year, month, day);

  return {
    year,
    month,
    day,
    gregorianDate,
  };
}

function getJalaaliMonthDays(year, month) {
  const numericYear = Number(year);
  const numericMonth = Number(month);

  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth)) {
    throw new Error("Invalid Solar Hijri year or month");
  }

  if (numericMonth >= 1 && numericMonth <= 6) {
    return 31;
  }

  if (numericMonth >= 7 && numericMonth <= 11) {
    return 30;
  }

  if (numericMonth === 12) {
    return jalaali.isLeapJalaaliYear(numericYear) ? 30 : 29;
  }

  throw new Error("Invalid Solar Hijri month");
}

function formatJalaali(year, month, day) {
  return `${String(year).padStart(4, "0")}/${String(month).padStart(
    2,
    "0",
  )}/${String(day).padStart(2, "0")}`;
}

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
