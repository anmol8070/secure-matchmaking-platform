const db = require('../../config/database').getDb();
const { extractFeatures, vectorizeFeatures, FEATURE_ORDER } = require('../features/featureGenerator');
const { trainLogisticRegression, predictProb } = require('../training/logisticRegression');
const { calculateMetrics } = require('../evaluation/metrics');
const MlModel = require('../../models/mlModel');

// We consider these as positive interactions (1)
const POSITIVE_ACTIONS = ['interest', 'connection_request', 'connection_accepted'];
// We consider these as negative interactions (0)
const NEGATIVE_ACTIONS = ['rejection'];
// Note: 'profile_view' and 'feedback' are ignored for training target

async function runTrainingPipeline() {
  console.log('--- Starting ML Phase 9 Training Pipeline ---');
  
  // 1. Fetch interactions
  console.log('Fetching historical interactions...');
  const interactions = await db('activity_feedback')
    .whereNotNull('target_user_id')
    .whereIn('action', [...POSITIVE_ACTIONS, ...NEGATIVE_ACTIONS])
    .orderBy('created_at', 'asc');
    
  if (interactions.length < 10) {
    // We need some minimum data to train a real model
    console.warn(`Only found ${interactions.length} eligible interactions. Proceeding anyway for evaluation purposes, but model may be poor.`);
  }

  // 2. Build dataset
  console.log('Building features and labels...');
  const X = [];
  const y = [];
  
  // We use a Map to prevent temporal leakage for the SAME pair
  // Keep only the first interaction (or only use snapshot features)
  const processedPairs = new Set();
  
  for (const interaction of interactions) {
    const pairKey = `${interaction.user_id}_${interaction.target_user_id}`;
    
    if (processedPairs.has(pairKey)) {
      continue; // Skip subsequent interactions between same pair to prevent leakage
    }
    
    const featuresObj = await extractFeatures(interaction.user_id, interaction.target_user_id);
    if (!featuresObj) continue; // Skip if one of the profiles was deleted
    
    const label = POSITIVE_ACTIONS.includes(interaction.action) ? 1 : 0;
    
    X.push(vectorizeFeatures(featuresObj));
    y.push(label);
    
    processedPairs.add(pairKey);
  }
  
  const totalSamples = X.length;
  const numPositive = y.filter(l => l === 1).length;
  const numNegative = totalSamples - numPositive;
  
  console.log(`Dataset size: ${totalSamples}`);
  console.log(`Positive samples: ${numPositive} (${((numPositive/totalSamples)*100).toFixed(1)}%)`);
  console.log(`Negative samples: ${numNegative} (${((numNegative/totalSamples)*100).toFixed(1)}%)`);
  
  if (totalSamples < 10) {
    console.log('Insufficient real interaction data for reliable ML evaluation');
    console.log('Falling back to baseline Phase 7/8 deterministic compatibility. Will not generate fake model.');
    return { status: 'skipped', reason: 'insufficient_data' };
  }

  // 3. Train/Test Split (80/20 chronological split)
  const splitIdx = Math.floor(totalSamples * 0.8);
  const X_train = X.slice(0, splitIdx);
  const y_train = y.slice(0, splitIdx);
  const X_test = X.slice(splitIdx);
  const y_test = y.slice(splitIdx);
  
  // 4. Handle class imbalance
  let classWeights = { 0: 1.0, 1: 1.0 };
  if (numPositive > 0 && numNegative > 0) {
    // Inverse frequency weighting
    classWeights[0] = totalSamples / (2 * numNegative);
    classWeights[1] = totalSamples / (2 * numPositive);
  }
  
  // 5. Train Model
  console.log('Training Logistic Regression model...');
  const { weights, bias } = trainLogisticRegression(X_train, y_train, 0.05, 100, classWeights);
  
  // 6. Evaluate Model on Test Set
  console.log('Evaluating model on test set...');
  // If test set is empty (e.g. extremely small dataset), evaluate on train set just to have metrics
  const eval_X = X_test.length > 0 ? X_test : X_train;
  const eval_y = y_test.length > 0 ? y_test : y_train;
  
  const y_pred_prob = eval_X.map(xi => predictProb(xi, weights, bias));
  const metrics = calculateMetrics(eval_y, y_pred_prob, 0.5);
  
  console.log('--- Model Evaluation ---');
  console.log(`Accuracy:  ${metrics.accuracy.toFixed(4)}`);
  console.log(`Precision: ${metrics.precision.toFixed(4)}`);
  console.log(`Recall:    ${metrics.recall.toFixed(4)}`);
  console.log(`F1 Score:  ${metrics.f1_score.toFixed(4)}`);
  console.log(`ROC-AUC:   ${metrics.roc_auc.toFixed(4)}`);
  
  // Format weights to save
  const modelWeights = {
    bias,
    ...FEATURE_ORDER.reduce((acc, feature, i) => {
      acc[feature] = weights[i];
      return acc;
    }, {})
  };

  // 7. Persist Model
  const modelVersion = `lr-v${Date.now()}`;
  console.log(`Persisting model version: ${modelVersion}...`);
  
  const saved = await MlModel.insertModel({
    model_version: modelVersion,
    model_type: 'logistic_regression',
    feature_version: 'v1',
    training_samples: X_train.length,
    positive_samples: y_train.filter(l => l===1).length,
    negative_samples: y_train.filter(l => l===0).length,
    precision: metrics.precision,
    recall: metrics.recall,
    f1_score: metrics.f1_score,
    roc_auc: metrics.roc_auc,
    weights: JSON.stringify(modelWeights),
    status: 'inactive' // Start inactive, require manual activation or automated threshold
  });
  
  console.log(`Model ${modelVersion} saved successfully.`);
  
  // Activate if performance is reasonable (e.g. better than random)
  // Or if it's the very first model
  const activeModel = await MlModel.getActiveModel();
  if (!activeModel || (metrics.roc_auc > 0.55 && metrics.f1_score > 0.1)) {
    console.log(`Activating model ${modelVersion}...`);
    await MlModel.activateModel(modelVersion);
    console.log('Model activated.');
  } else {
    console.log(`Model ${modelVersion} left inactive due to poor metrics or existing better model.`);
  }

  console.log('Training pipeline completed.');
  return { modelVersion, metrics, saved };
}

// Allow running from command line
if (require.main === module) {
  runTrainingPipeline()
    .then(() => {
      require('../../config/database').closeConnection();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Training failed:', err);
      require('../../config/database').closeConnection();
      process.exit(1);
    });
}

module.exports = { runTrainingPipeline };
