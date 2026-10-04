/** user_hobbies — users ↔ hobbies link (composite key). */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'user_hobbies', primaryKey: ['user_id', 'hobby_id'] });
