/** otp_codes — hashed one-time passwords (never the code itself). */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'otp_codes', primaryKey: 'otp_id' });
