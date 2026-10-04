/** activity_feedback — interaction log for adaptive recommendation. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'activity_feedback', primaryKey: 'id' });
