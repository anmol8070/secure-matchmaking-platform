/** quiz_answers — optional compatibility-question answers. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'quiz_answers', primaryKey: 'id' });
