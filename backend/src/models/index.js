/** All models, one per table created in Phase 2. */
module.exports = {
  User: require('./userModel'),
  Profile: require('./profileModel'),
  Preference: require('./preferenceModel'),
  Hobby: require('./hobbyModel'),
  UserHobby: require('./userHobbyModel'),
  QuizAnswer: require('./quizAnswerModel'),
  Match: require('./matchModel'),
  ConnectionRequest: require('./connectionRequestModel'),
  Message: require('./messageModel'),
  Report: require('./reportModel'),
  Block: require('./blockModel'),
  ActivityFeedback: require('./activityFeedbackModel'),
  LoginVerification: require('./loginVerificationModel'),
};
