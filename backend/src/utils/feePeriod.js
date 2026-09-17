const { jalaaliToDate, getJalaaliMonthDays } = require("./solarDate");

function parseSolarDate(value) {
  if (typeof value !== "string") {
    throw new Error("Solar Hijri date must be a string");
  }

  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (!match) {
    throw new Error("Invalid Solar Hijri date. Expected YYYY/MM/DD");
  }

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  const gregorianDate = jalaaliToDate(jy, jm, jd);

  return {
    jy,
    jm,
    jd,
    gregorianDate,
  };
}

function formatSolarDate(jy, jm, jd) {
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

function calculateFeePeriod(fromSolarDate, toSolarDate, monthlyAmount) {
  const start = parseSolarDate(fromSolarDate);
  const end = parseSolarDate(toSolarDate);

  if (start.gregorianDate > end.gregorianDate) {
    throw new Error("To date cannot be before from date");
  }

  const amount = Number(monthlyAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Monthly amount must be greater than zero");
  }

  const months = [];

  let jy = start.jy;
  let jm = start.jm;

  while (jy < end.jy || (jy === end.jy && jm <= end.jm)) {
    const monthDays = getJalaaliMonthDays(jy, jm);

    const rangeStart = jy === start.jy && jm === start.jm ? start.jd : 1;

    const rangeEnd = jy === end.jy && jm === end.jm ? end.jd : monthDays;

    const coveredDays = rangeEnd - rangeStart + 1;

    if (coveredDays > 0) {
      const calculatedAmount = Number(
        ((amount / monthDays) * coveredDays).toFixed(2),
      );

      months.push({
        solar_year: jy,
        solar_month: jm,
        month_days: monthDays,
        covered_days: coveredDays,
        monthly_amount: amount,
        calculated_amount: calculatedAmount,
      });
    }

    jm++;

    if (jm > 12) {
      jm = 1;
      jy++;
    }
  }

  const coveredDays = months.reduce(
    (sum, month) => sum + month.covered_days,
    0,
  );

  const totalAmount = Number(
    months.reduce((sum, month) => sum + month.calculated_amount, 0).toFixed(2),
  );

  return {
    from_solar_date: formatSolarDate(start.jy, start.jm, start.jd),
    to_solar_date: formatSolarDate(end.jy, end.jm, end.jd),
    from_date: start.gregorianDate,
    to_date: end.gregorianDate,
    covered_days: coveredDays,
    total_amount: totalAmount,
    months,
  };
}

module.exports = {
  parseSolarDate,
  calculateFeePeriod,
};
