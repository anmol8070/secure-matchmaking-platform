/** users — account identity and state. */
const BaseModel = require('./BaseModel');

// Columns that may leave the backend. password_hash is never included.
const PUBLIC_FIELDS = [
  'user_id',
  'email',
  'mobile',
  'role',
  'status',
  'email_verified_at',
  'mobile_verified_at',
  'last_login_at',
  'created_at',
];

class UserModel extends BaseModel {
  /** @param {'email'|'mobile'} channel  @param {string} value normalised contact */
  findByContact(channel, value, trx) {
    return this.query(trx).where({ [channel]: value }).first();
  }

  toPublic(user) {
    if (!user) return user;
    return Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, user[field] ?? null]));
  }
}

module.exports = new UserModel({ table: 'users', primaryKey: 'user_id' });
module.exports.PUBLIC_FIELDS = PUBLIC_FIELDS;
