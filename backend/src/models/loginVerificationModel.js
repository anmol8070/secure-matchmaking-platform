/** login_verifications — presence-check outcomes (no images). */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'login_verifications', primaryKey: 'verification_id', jsonColumns: ['detection_result'] });
