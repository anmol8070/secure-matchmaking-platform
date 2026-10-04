/**
 * Age in whole years from a 'YYYY-MM-DD' date of birth (UTC calendar).
 * Age is always derived — never stored — so it cannot go stale.
 */
function ageFromDateOfBirth(dateOfBirth, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth || '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** True for a real calendar date (rejects 2023-02-30 etc.). */
function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

module.exports = { ageFromDateOfBirth, isValidDate };
