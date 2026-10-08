const { LogisticRegressionEngine, DEFAULT_WEIGHTS } = require('../src/services/ml/logisticRegressionEngine');

describe('LogisticRegressionEngine Unit Tests', () => {
  let engine;

  beforeEach(() => {
    engine = new LogisticRegressionEngine();
  });

  it('initializes with default weights', () => {
    const weights = engine.getWeights();
    expect(weights.w0).toBe(DEFAULT_WEIGHTS.w0);
    expect(weights.compatibilityScore).toBe(DEFAULT_WEIGHTS.compatibilityScore);
  });

  it('computes sigmoid probabilities between 0 and 1', () => {
    expect(engine.sigmoid(0)).toBe(0.5);
    expect(engine.sigmoid(100)).toBeCloseTo(1, 4);
    expect(engine.sigmoid(-100)).toBeCloseTo(0, 4);
  });

  it('predicts higher probability for high compatibility and high hobby overlap', () => {
    const highFeatures = {
      compatibilityScore: 0.9,
      demographicScore: 0.9,
      lifestyleScore: 0.8,
      hobbyJaccard: 0.8,
      quizSimilarity: 0.9,
      viewerCTR: 0.6,
      candidatePopularity: 0.7,
      recencyScore: 0.9,
    };

    const lowFeatures = {
      compatibilityScore: 0.1,
      demographicScore: 0.1,
      lifestyleScore: 0.1,
      hobbyJaccard: 0.0,
      quizSimilarity: 0.1,
      viewerCTR: 0.2,
      candidatePopularity: 0.2,
      recencyScore: 0.1,
    };

    const pHigh = engine.predictProbability(highFeatures);
    const pLow = engine.predictProbability(lowFeatures);

    expect(pHigh).toBeGreaterThan(0.5);
    expect(pLow).toBeLessThan(0.5);
    expect(pHigh).toBeGreaterThan(pLow);
  });

  it('updates weights via online SGD trainStep on positive feedback', () => {
    const features = {
      compatibilityScore: 0.8,
      hobbyJaccard: 0.6,
    };

    const initialWeights = engine.getWeights();
    const initialProb = engine.predictProbability(features);

    // Perform positive feedback training step
    const result = engine.trainStep(features, 1, 0.1);

    expect(result.prediction).toBe(initialProb);
    expect(result.error).toBeGreaterThan(0);
    expect(result.updatedWeights.compatibilityScore).toBeGreaterThan(initialWeights.compatibilityScore);

    const newProb = engine.predictProbability(features);
    expect(newProb).toBeGreaterThan(initialProb);
  });

  it('updates weights via online SGD trainStep on negative feedback', () => {
    const features = {
      compatibilityScore: 0.8,
      hobbyJaccard: 0.6,
    };

    const initialWeights = engine.getWeights();
    const initialProb = engine.predictProbability(features);

    // Perform negative feedback training step
    const result = engine.trainStep(features, 0, 0.1);

    expect(result.error).toBeLessThan(0);
    expect(result.updatedWeights.compatibilityScore).toBeLessThan(initialWeights.compatibilityScore);

    const newProb = engine.predictProbability(features);
    expect(newProb).toBeLessThan(initialProb);
  });
});
