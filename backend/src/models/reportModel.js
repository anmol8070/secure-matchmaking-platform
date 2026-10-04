/** reports — user reports for admin review. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'reports', primaryKey: 'report_id' });
