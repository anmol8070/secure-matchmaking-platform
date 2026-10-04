/** preferences — 1:1 food, lifestyle, location and partner preferences. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'preferences', primaryKey: 'user_id', jsonColumns: ['partner_preferences'] });
