/** messages — private messages. Never log message text. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'messages', primaryKey: 'message_id' });
