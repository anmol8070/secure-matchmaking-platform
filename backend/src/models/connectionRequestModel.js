/** connection_requests — pending/accepted/rejected requests. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'connection_requests', primaryKey: 'request_id' });
