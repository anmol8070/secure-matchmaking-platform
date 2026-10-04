/** profiles — 1:1 public profile, including profile_photo_url. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'profiles', primaryKey: 'user_id' });
