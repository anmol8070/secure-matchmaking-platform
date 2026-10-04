import { Navigate, useNavigate } from 'react-router-dom';
import Alert from '../../../components/common/Alert.jsx';
import ProfileForm from '../../../components/profile/ProfileForm.jsx';
import ProfilePhotoUploader from '../../../components/profile/ProfilePhotoUploader.jsx';
import useOwnProfile from '../../../hooks/useOwnProfile.js';
import { profileService } from '../../../services/profileService.js';
import { toFormValues } from '../../../utils/profileFields.js';
import { USER_PATHS } from '../../../routes/paths.js';

/** /profile/edit — update profile fields; the picture saves independently. */
function ProfileEdit() {
  const navigate = useNavigate();
  const { status, profile, error, setProfile } = useOwnProfile();

  if (status === 'loading') return <p className="muted" role="status">Loading your profile…</p>;
  if (status === 'missing') return <Navigate to={USER_PATHS.PROFILE_CREATE} replace />;
  if (status === 'error') return <Alert type="error">{error}</Alert>;

  const save = async (body) => {
    await profileService.update(body);
    navigate(USER_PATHS.PROFILE, { state: { message: 'Profile updated successfully.' } });
  };

  return (
    <div className="stack">
      <section className="card">
        <h1>Edit profile</h1>
        <ProfileForm
          initialValues={toFormValues(profile)}
          submitLabel="Save changes"
          onSubmit={save}
          onCancel={() => navigate(USER_PATHS.PROFILE)}
        />
      </section>
      <section className="card">
        <h2>Profile picture</h2>
        <ProfilePhotoUploader photoUrl={profile.profilePhotoUrl} name={profile.name} onChange={setProfile} />
      </section>
    </div>
  );
}

export default ProfileEdit;
