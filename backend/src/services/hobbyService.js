/**
 * Hobby catalogue and the user ↔ hobby mapping (user_hobbies).
 *
 * The catalogue lives in the database (seeded; admins manage it later). Users
 * select hobbies by id only — arbitrary names are never accepted. The mapping
 * is stored as a set: the composite primary key (user_id, hobby_id) makes
 * duplicates impossible.
 */
const { getDb } = require('../config/database');
const Hobby = require('../models/hobbyModel');
const UserHobby = require('../models/userHobbyModel');
const ApiError = require('../utils/ApiError');

const toHobby = (row) => ({ id: row.hobby_id, name: row.hobby_name });

/** Active hobbies, alphabetically. */
async function listActive() {
  const rows = await Hobby.query().where({ status: 'active' }).orderBy('hobby_name').select('hobby_id', 'hobby_name');
  return rows.map(toHobby);
}

/** The user's selected hobbies (active ones only), alphabetically. */
async function getUserHobbies(userId, trx) {
  const rows = await UserHobby.query(trx)
    .join('hobbies', 'hobbies.hobby_id', 'user_hobbies.hobby_id')
    .where({ 'user_hobbies.user_id': userId, 'hobbies.status': 'active' })
    .orderBy('hobbies.hobby_name')
    .select('hobbies.hobby_id', 'hobbies.hobby_name');
  return rows.map(toHobby);
}

/** Throws 422 listing every id that does not exist or is inactive. */
async function assertSelectable(hobbyIds, trx, field) {
  if (hobbyIds.length === 0) return;
  const rows = await Hobby.query(trx).whereIn('hobby_id', hobbyIds).select('hobby_id', 'status');
  const active = new Set(rows.filter((r) => r.status === 'active').map((r) => r.hobby_id));
  const invalid = hobbyIds.filter((hid) => !active.has(hid));
  if (invalid.length > 0) {
    throw ApiError.validation(invalid.map((hid) => ({ field, message: `Unknown or inactive hobby: ${hid}` })));
  }
}

/**
 * Replaces the user's selection with exactly `hobbyIds` (an empty list clears
 * it). Unchanged mappings are kept; removed ones are deleted. Must run in the
 * caller's transaction when combined with other writes.
 */
async function setUserHobbies(userId, hobbyIds, trx, { field = 'body.hobbyIds' } = {}) {
  await assertSelectable(hobbyIds, trx, field);

  const removeQuery = UserHobby.query(trx).where({ user_id: userId });
  if (hobbyIds.length > 0) removeQuery.whereNotIn('hobby_id', hobbyIds);
  await removeQuery.del();

  if (hobbyIds.length > 0) {
    await UserHobby.query(trx)
      .insert(hobbyIds.map((hobbyId) => ({ user_id: userId, hobby_id: hobbyId })))
      .onConflict(['user_id', 'hobby_id'])
      .ignore();
  }
}

/** Standalone selection update (own transaction). */
async function replaceUserHobbies(userId, hobbyIds) {
  return getDb().transaction(async (trx) => {
    await setUserHobbies(userId, hobbyIds, trx);
    return getUserHobbies(userId, trx);
  });
}

/** Removes one hobby from the user's selection. 404 if it was not selected. */
async function removeUserHobby(userId, hobbyId) {
  const removed = await UserHobby.query().where({ user_id: userId, hobby_id: hobbyId }).del();
  if (removed === 0) throw ApiError.notFound('This hobby is not in your list');
  return getUserHobbies(userId);
}

module.exports = { listActive, getUserHobbies, setUserHobbies, replaceUserHobbies, removeUserHobby };
