const db = require('../config/database').getDb();
const ApiError = require('../utils/ApiError');

class MlModel {
  /**
   * Insert a new trained ML model version.
   */
  static async insertModel(modelData) {
    const [inserted] = await db('ml_model_versions').insert(modelData).returning('*');
    return inserted;
  }

  /**
   * Get the active model.
   */
  static async getActiveModel() {
    return await db('ml_model_versions')
      .where({ status: 'active' })
      .orderBy('trained_at', 'desc')
      .first();
  }

  /**
   * Set a specific model to active and others to inactive.
   */
  static async activateModel(modelVersion) {
    await db.transaction(async (trx) => {
      // Deactivate currently active models
      await trx('ml_model_versions')
        .where({ status: 'active' })
        .update({ status: 'inactive' });

      // Activate the requested model
      const updated = await trx('ml_model_versions')
        .where({ model_version: modelVersion })
        .update({ status: 'active' });

      if (updated === 0) {
        throw new ApiError(404, 'Model version not found');
      }
    });
  }

  /**
   * List all model versions.
   */
  static async listModels(limit = 20) {
    return await db('ml_model_versions')
      .orderBy('trained_at', 'desc')
      .limit(limit);
  }
}

module.exports = MlModel;
