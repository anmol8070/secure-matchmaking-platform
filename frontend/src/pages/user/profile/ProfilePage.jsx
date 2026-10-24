import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Alert from '../../../components/common/Alert.jsx';
import ProfileView from '../../../components/profile/ProfileView.jsx';
import ProfilePhotoUploader from '../../../components/profile/ProfilePhotoUploader.jsx';
import useDialog from '../../../hooks/useDialog.js';
import useOwnProfile from '../../../hooks/useOwnProfile.js';
import { USER_PATHS } from '../../../routes/paths.js';

function ChangePhotoDialog({ profile, onClose, onChange }) {
  const dialogRef = useDialog(onClose);

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="dialog card dialog--wide" role="dialog" aria-modal="true" aria-labelledby="change-photo-title" tabIndex={-1}>
        <h2 id="change-photo-title">Change photo</h2>
        <ProfilePhotoUploader
          photoUrl={profile.profilePhotoUrl}
          name={profile.name}
          onChange={(next) => {
            onChange(next);
            onClose();
          }}
        />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

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
      {state?.message && <Alert type="success">{state.message}</Alert>}
      {state?.warning && <Alert type="error">{state.warning}</Alert>}
      <ProfileView profile={profile} onChangePhoto={() => setEditingPhoto(true)} />
      {editingPhoto && (
        <ChangePhotoDialog profile={profile} onClose={() => setEditingPhoto(false)} onChange={setProfile} />
      )}
    </div>
  );
}

export default ProfilePage;
