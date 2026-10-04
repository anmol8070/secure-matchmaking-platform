/** hobbies — hobby catalogue. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'hobbies', primaryKey: 'hobby_id' });
