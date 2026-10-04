/** matches — directional compatibility results written by matchingService. */
const BaseModel = require('./BaseModel');

module.exports = new BaseModel({ table: 'matches', primaryKey: 'match_id', jsonColumns: ['score_breakdown'] });
