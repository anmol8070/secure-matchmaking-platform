/**
 * ML Evaluation Metrics
 */

function calculateMetrics(yTrue, yPredProb, threshold = 0.5) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    const actual = yTrue[i];
    const predicted = yPredProb[i] >= threshold ? 1 : 0;

    if (actual === 1 && predicted === 1) tp++;
    if (actual === 0 && predicted === 0) tn++;
    if (actual === 0 && predicted === 1) fp++;
    if (actual === 1 && predicted === 0) fn++;
  }

  const accuracy = (tp + tn) / (tp + tn + fp + fn) || 0;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1_score = (2 * precision * recall) / (precision + recall) || 0;

  // Approximate ROC-AUC by sorting and calculating area
  const auc = calculateROC_AUC(yTrue, yPredProb);

  return {
    accuracy,
    precision,
    recall,
    f1_score,
    roc_auc: auc,
    tp,
    tn,
    fp,
    fn
  };
}

function calculateROC_AUC(yTrue, yPredProb) {
  // Pair and sort by predicted probability descending
  const pairs = yTrue.map((t, i) => ({ t, p: yPredProb[i] }));
  pairs.sort((a, b) => b.p - a.p);

  let numPos = yTrue.filter(y => y === 1).length;
  let numNeg = yTrue.length - numPos;

  if (numPos === 0 || numNeg === 0) return 0.5;

  let auc = 0;
  let currentPos = 0;
  let currentNeg = 0;
  let prevProb = -1;

  // Compute area under curve using trapezoidal rule
  let tprs = [0];
  let fprs = [0];

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].t === 1) currentPos++;
    else currentNeg++;

    tprs.push(currentPos / numPos);
    fprs.push(currentNeg / numNeg);
  }

  for (let i = 1; i < tprs.length; i++) {
    auc += (fprs[i] - fprs[i - 1]) * (tprs[i] + tprs[i - 1]) / 2;
  }

  return auc;
}

module.exports = {
  calculateMetrics,
  calculateROC_AUC
};
