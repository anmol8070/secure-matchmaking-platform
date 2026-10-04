/** users — account identity and state. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'users', primaryKey: 'user_id' });
