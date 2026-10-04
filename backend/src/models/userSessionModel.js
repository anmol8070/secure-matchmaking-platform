/** user_sessions — one row per issued access token; revoked on logout. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'user_sessions', primaryKey: 'session_id' });
