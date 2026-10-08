const MlModel = require('../../models/mlModel');
const { extractFeatures, vectorizeFeatures } = require('../features/featureGenerator');
const { predictProb } = require('../training/logisticRegression');

// Cache the active model in memory to avoid DB hits on every request
let cachedActiveModel = null;
let lastModelFetch = 0;
const CACHE_TTL_MS = 60000; // 1 minute

async function getActiveModel() {
  const now = Date.now();
  if (cachedActiveModel && (now - lastModelFetch < CACHE_TTL_MS)) {
    return cachedActiveModel;
  }

  const modelRecord = await MlModel.getActiveModel();
  if (modelRecord && modelRecord.weights) {
    // Parse weights JSON
    cachedActiveModel = {
      ...modelRecord,
      parsedWeights: typeof modelRecord.weights === 'string' 
        ? JSON.parse(modelRecord.weights) 
        : modelRecord.weights
    };
  } else {
    cachedActiveModel = null;
  }
  
  lastModelFetch = now;
  return cachedActiveModel;
}

/**
 * Force model reload (e.g. after training).
 */
function invalidateModelCache() {
  cachedActiveModel = null;
  lastModelFetch = 0;
}

/**
 * Predicts the positive interaction probability for a candidate.
 * 
 * @param {number} userId Requesting user ID
 * @param {number} candidateId Candidate user ID
 * @param {object} precalculatedFeatures (Optional) if features were already extracted
 * @returns {Promise<number|null>} Probability between 0 and 1, or null if no model exists
 */
async function predictCandidateProbability(userId, candidateId, precalculatedFeatures = null) {
  const model = await getActiveModel();
  if (!model) {
    // Cold start / fallback
    return null;
  }

  const features = precalculatedFeatures || await extractFeatures(userId, candidateId);
  if (!features) return null;

  const x = vectorizeFeatures(features);
  
  // Reconstruct weight array in the same order as FEATURE_ORDER
  const { FEATURE_ORDER } = require('../features/featureGenerator');
  const weightsArr = FEATURE_ORDER.map(f => model.parsedWeights[f] || 0);
  const bias = model.parsedWeights.bias || 0;

  return predictProb(x, weightsArr, bias);
}

module.exports = {
  predictCandidateProbability,
  getActiveModel,
  invalidateModelCache
};
