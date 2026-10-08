/**
 * Logistic Regression Engine for Adaptive Personalized Recommendation (Phase 7).
 *
 * Implements binary classification to predict P(Positive Interaction | User, Candidate).
 * Uses sigmoid(z) over engineered feature vectors with online Stochastic Gradient Descent
 * (SGD) weight updates driven by user interaction feedback (views, likes, connections, passes).
 */

const DEFAULT_WEIGHTS = {
  w0: -1.2,                // Bias / Intercept
  compatibilityScore: 2.2, // Phase 7 overall compatibility score (normalized 0-1)
  demographicScore: 0.8,   // Location & age alignment (normalized 0-1)
  lifestyleScore: 0.8,     // Food, education, lifestyle alignment (normalized 0-1)
  hobbyJaccard: 1.5,       // Hobby similarity coefficient (0-1)
  quizSimilarity: 1.2,     // Compatibility quiz answer similarity (0-1)
  viewerCTR: 0.5,          // Historical positive interaction rate of the viewing user
  candidatePopularity: 0.6,// Historical acceptance/like rate of candidate user
  recencyScore: 0.4,       // Candidate profile recency decay score
};

class LogisticRegressionEngine {
  constructor(weights = { ...DEFAULT_WEIGHTS }) {
    this.weights = { ...weights };
  }

  /**
   * Sigmoidal activation function.
   * @param {number} z
   * @returns {number} probability in (0, 1)
   */
  sigmoid(z) {
    // Clamp z to avoid math overflow/underflow
    const clampedZ = Math.max(-15, Math.min(15, z));
    return 1 / (1 + Math.exp(-clampedZ));
  }

  /**
   * Predicts the probability of a positive interaction for a given feature vector.
   * @param {object} features
   * @returns {number} probability between 0.0 and 1.0
   */
  predictProbability(features) {
    const z =
      this.weights.w0 +
      this.weights.compatibilityScore * (features.compatibilityScore || 0) +
      this.weights.demographicScore * (features.demographicScore || 0) +
      this.weights.lifestyleScore * (features.lifestyleScore || 0) +
      this.weights.hobbyJaccard * (features.hobbyJaccard || 0) +
      this.weights.quizSimilarity * (features.quizSimilarity || 0) +
      this.weights.viewerCTR * (features.viewerCTR || 0) +
      this.weights.candidatePopularity * (features.candidatePopularity || 0) +
      this.weights.recencyScore * (features.recencyScore || 0);

    return this.sigmoid(z);
  }

  /**
   * Performs an online SGD training step on a single interaction sample.
   * @param {object} features
   * @param {number} targetLabel 1 for positive interaction, 0 for negative/neutral
   * @param {number} learningRate learning rate hyperparameter (default 0.05)
   * @returns {object} { prediction, error, updatedWeights }
   */
  trainStep(features, targetLabel, learningRate = 0.05) {
    const y = targetLabel ? 1 : 0;
    const yHat = this.predictProbability(features);
    const error = y - yHat;

    this.weights.w0 += learningRate * error;
    this.weights.compatibilityScore += learningRate * error * (features.compatibilityScore || 0);
    this.weights.demographicScore += learningRate * error * (features.demographicScore || 0);
    this.weights.lifestyleScore += learningRate * error * (features.lifestyleScore || 0);
    this.weights.hobbyJaccard += learningRate * error * (features.hobbyJaccard || 0);
    this.weights.quizSimilarity += learningRate * error * (features.quizSimilarity || 0);
    this.weights.viewerCTR += learningRate * error * (features.viewerCTR || 0);
    this.weights.candidatePopularity += learningRate * error * (features.candidatePopularity || 0);
    this.weights.recencyScore += learningRate * error * (features.recencyScore || 0);

    return {
      prediction: yHat,
      error,
      updatedWeights: { ...this.weights },
    };
  }

  /** Gets current model weights. */
  getWeights() {
    return { ...this.weights };
  }

  /** Resets model weights to defaults. */
  resetWeights() {
    this.weights = { ...DEFAULT_WEIGHTS };
  }
}

// Singleton instance shared across recommendation service
const defaultEngine = new LogisticRegressionEngine();

module.exports = {
  LogisticRegressionEngine,
  defaultEngine,
  DEFAULT_WEIGHTS,
};
