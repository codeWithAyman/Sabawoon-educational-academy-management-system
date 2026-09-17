const {
  toJalaali,
  toGregorian,
  isValidJalaaliDate,
  jalaaliMonthLength,
} = require("jalaali-js");

function dateToJalaali(dateInput) {
  let gy;
  let gm;
  let gd;

  if (typeof dateInput === "string") {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      throw new Error("Invalid Gregorian date");
    }

    gy = Number(match[1]);
    gm = Number(match[2]);
    gd = Number(match[3]);
  } else {
    const date = new Date(dateInput);

    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid Gregorian date");
    }

    gy = date.getFullYear();
    gm = date.getMonth() + 1;
    gd = date.getDate();
  }

  return toJalaali(gy, gm, gd);
}

function jalaaliToDate(jy, jm, jd) {
  if (!isValidJalaaliDate(jy, jm, jd)) {
    throw new Error("Invalid Solar Hijri date");
  }

  const { gy, gm, gd } = toGregorian(jy, jm, jd);

  // Construct at local noon to avoid DST/midnight edge cases.
  return new Date(gy, gm - 1, gd, 12, 0, 0, 0);
}

function getJalaaliMonthDays(jy, jm) {
  if (jm < 1 || jm > 12) {
    throw new Error("Invalid Solar Hijri month");
  }

  return jalaaliMonthLength(jy, jm);
}

function formatJalaali(jy, jm, jd) {
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

module.exports = {
  dateToJalaali,
  jalaaliToDate,
  getJalaaliMonthDays,
  formatJalaali,
};
