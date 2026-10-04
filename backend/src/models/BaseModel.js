/**
 * Data-access foundation shared by all models.
 *
 * A model knows its table, primary key and JSON columns. Services use models
 * for all database access — controllers never query the database directly.
 * Table-specific queries are added to each model in the phase that needs them.
 */
const { getDb } = require('../config/database');

class BaseModel {
  /**
   * @param {object} options
   * @param {string} options.table
   * @param {string|string[]} options.primaryKey  string, or array for composite keys
   * @param {string[]} [options.jsonColumns]      JSON columns to parse on read
   */
  constructor({ table, primaryKey, jsonColumns = [] }) {
    this.table = table;
    this.primaryKey = primaryKey;
    this.jsonColumns = jsonColumns;
  }

  /** Query builder for this table; pass a transaction to run inside it. */
  query(trx) {
    return (trx || getDb())(this.table);
  }

  /** WHERE clause matching a primary key value (or an object for composite keys). */
  keyFilter(key) {
    if (Array.isArray(this.primaryKey)) {
      return Object.fromEntries(this.primaryKey.map((column) => [column, key[column]]));
    }
    return { [this.primaryKey]: key };
  }

  /** Inserts one row and returns its generated primary key (single-column keys only). */
  async insertAndGetId(row, trx) {
    const query = this.query(trx);
    // PostgreSQL needs RETURNING; MySQL has none and returns [insertId].
    if (query.client.dialect === 'postgresql') {
      const [inserted] = await query.insert(row, [this.primaryKey]);
      return inserted[this.primaryKey];
    }
    const [insertId] = await query.insert(row);
    return insertId;
  }

  async findByPk(key, trx) {
    const row = await this.query(trx).where(this.keyFilter(key)).first();
    return this.parseRow(row);
  }

  /**
   * MariaDB returns JSON columns as strings; PostgreSQL and MySQL 8 return
   * objects. Normalise so services always receive parsed values.
   */
  parseRow(row) {
    if (!row) return row;
    for (const column of this.jsonColumns) {
      if (typeof row[column] === 'string') row[column] = JSON.parse(row[column]);
    }
    return row;
  }
}

module.exports = BaseModel;
