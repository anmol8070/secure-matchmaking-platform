/** blocks — blocker → blocked. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'blocks', primaryKey: 'block_id' });
