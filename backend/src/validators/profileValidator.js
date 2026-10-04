/**
 * Request schemas for /api/v1/profile — field rules are added in the profile phase.
 *
 * Planned schemas:
 *   createProfileBody / updateProfileBody   name, date_of_birth (18+), gender,
 *                                           city/state/country, education,
 *                                           occupation, lifestyle, bio (≤ 2000)
 *   profilePhotoUpload                      image type/size checks for gallery,
 *                                           file or camera uploads (multipart)
 */
const { userIdParams } = require('./commonValidator');

module.exports = {
  userIdParams,
};
