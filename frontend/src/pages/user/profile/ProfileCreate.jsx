import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Alert from '../../../components/common/Alert.jsx';
import ProfileForm from '../../../components/profile/ProfileForm.jsx';
import ProfilePhotoUploader from '../../../components/profile/ProfilePhotoUploader.jsx';
import useOwnProfile from '../../../hooks/useOwnProfile.js';
import { profileService } from '../../../services/profileService.js';
import { USER_PATHS } from '../../../routes/paths.js';

/** /profile/create — first-time profile, with an optional picture. */
function ProfileCreate() {
  const navigate = useNavigate();
  const { status, error } = useOwnProfile();
  const [photo, setPhoto] = useState(null);

  if (status === 'loading') return <p className="muted" role="status">Loading…</p>;
  if (status === 'ready') return <Navigate to={USER_PATHS.PROFILE_EDIT} replace />;

  const create = async (body) => {
    await profileService.create(body);
    let warning;
    if (photo) {
      try {
        await profileService.uploadPhoto(photo);
      } catch (err) {
        // The profile is saved; the picture can be added again from the profile page.
        warning = `Your profile was saved, but the picture could not be uploaded: ${err.message}`;
      }
    }
    navigate(USER_PATHS.PROFILE, { replace: true, state: { message: 'Profile created successfully.', warning } });
  };

  return (
    <section className="card">
      <h1>Complete your profile</h1>
      <p className="muted">Tell others a little about yourself. Name and date of birth are required.</p>
      {status === 'error' && <Alert type="error">{error}</Alert>}
      <ProfileForm submitLabel="Save profile" onSubmit={create} onCancel={() => navigate(USER_PATHS.DASHBOARD)}>
        <fieldset>
          <legend>Profile picture (optional)</legend>
          <ProfilePhotoUploader mode="deferred" onFileChange={setPhoto} />
        </fieldset>
      </ProfileForm>
    </section>
  );
}

export default ProfileCreate;
