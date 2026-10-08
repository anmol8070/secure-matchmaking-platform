/**
 * Logistic Regression Training Algorithm
 */

function sigmoid(z) {
  const clampedZ = Math.max(-15, Math.min(15, z));
  return 1 / (1 + Math.exp(-clampedZ));
}

function predictProb(x, weights, bias) {
  let z = bias;
  for (let i = 0; i < x.length; i++) {
    z += x[i] * weights[i];
  }
  return sigmoid(z);
}

/**
 * Train Logistic Regression using Stochastic Gradient Descent.
 * 
 * @param {Array<Array<number>>} X Training features (2D array)
 * @param {Array<number>} y Target labels (0 or 1)
 * @param {number} learningRate Learning rate
 * @param {number} epochs Number of training epochs
 * @param {object} classWeights Object with class weights, e.g. { 0: 1, 1: 5 } to handle imbalance
 */
function trainLogisticRegression(X, y, learningRate = 0.01, epochs = 100, classWeights = { 0: 1, 1: 1 }) {
  const numFeatures = X[0].length;
  const numSamples = X.length;
  
  // Initialize weights
  let weights = new Array(numFeatures).fill(0);
  let bias = 0;

  // SGD
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = 0; i < numSamples; i++) {
      const xi = X[i];
      const yi = y[i];
      
      const yHat = predictProb(xi, weights, bias);
      const error = yHat - yi;
      
      // Apply class weight
      const weightMultiplier = classWeights[yi] || 1.0;
      const gradientMultiplier = learningRate * error * weightMultiplier;
      
      // Update bias
      bias -= gradientMultiplier;
      
      // Update weights
      for (let j = 0; j < numFeatures; j++) {
        weights[j] -= gradientMultiplier * xi[j];
      }
    }
  }

  return { weights, bias };
}

module.exports = {
  trainLogisticRegression,
  predictProb,
  sigmoid
};
