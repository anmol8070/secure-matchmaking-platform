import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Alert from '../../../components/common/Alert.jsx';
import ProfileView from '../../../components/profile/ProfileView.jsx';
import ProfilePhotoUploader from '../../../components/profile/ProfilePhotoUploader.jsx';
import useOwnProfile from '../../../hooks/useOwnProfile.js';
import { USER_PATHS } from '../../../routes/paths.js';

/** /profile — the signed-in user's profile. Sends new users to "Complete profile". */
function ProfilePage() {
  const { state } = useLocation();
  const { status, profile, error, setProfile } = useOwnProfile();
  const [editingPhoto, setEditingPhoto] = useState(false);

  if (status === 'loading') return <p className="muted" role="status">Loading your profile…</p>;
  if (status === 'missing') return <Navigate to={USER_PATHS.PROFILE_CREATE} replace />;
  if (status === 'error') return <Alert type="error">{error}</Alert>;

  return (
    <div className="stack">
      <Alert>{state?.message}</Alert>
      {state?.warning && <Alert type="error">{state.warning}</Alert>}
      <ProfileView profile={profile} onChangePhoto={() => setEditingPhoto((open) => !open)} />
      {editingPhoto && (
        <section className="card">
          <h2>Profile picture</h2>
          <ProfilePhotoUploader photoUrl={profile.profilePhotoUrl} name={profile.name} onChange={setProfile} />
        </section>
      )}
    </div>
  );
}

export default ProfilePage;
