/**
 * ml_model_versions — stores the metadata and weights of trained ML models
 */
const { applyTableOptions, addTimestamps } = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('ml_model_versions', (table) => {
    applyTableOptions(knex, table);

    table.increments('id').primary();
    table.string('model_version', 50).notNullable().unique();
    table.string('model_type', 50).notNullable(); // e.g. 'logistic_regression'
    table.string('feature_version', 50).notNullable();
    
    // Dataset stats
    table.integer('training_samples').notNullable();
    table.integer('positive_samples').notNullable();
    table.integer('negative_samples').notNullable();
    
    // Evaluation metrics
    table.float('precision');
    table.float('recall');
    table.float('f1_score');
    table.float('roc_auc');
    table.float('precision_at_k');
    table.float('acceptance_rate');
    
    // Model configuration and weights
    table.jsonb('weights').notNullable();
    
    table.string('status', 20).notNullable().defaultTo('inactive'); // 'active', 'inactive', 'archived'
    
    table.timestamp('trained_at').notNullable().defaultTo(knex.fn.now());
    addTimestamps(knex, table);
    
    // Constraints
    table.check('status IN (\'active\', \'inactive\', \'archived\')', [], 'chk_ml_models_status');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ml_model_versions');
};
