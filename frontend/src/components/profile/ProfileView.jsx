import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { USER_PATHS } from '../../routes/paths.js';
import { GENDER_OPTIONS } from '../../utils/profileFields.js';

const genderLabel = (value) => GENDER_OPTIONS.find(([key]) => key === value)?.[1];

const FIELD_LABELS = {
  name: 'Name',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  location: 'Location',
  education: 'Education',
  occupation: 'Occupation',
  lifestyle: 'Lifestyle',
  bio: 'About me',
  profilePhoto: 'Profile picture',
};

/** Read-only profile with completion status and edit actions. */
function ProfileView({ profile, onChangePhoto }) {
  const rows = [
    ['Age', profile.age],
    ['Gender', genderLabel(profile.gender)],
    ['Location', profile.location],
    ['Education', profile.education],
    ['Occupation', profile.occupation],
    ['Lifestyle', profile.lifestyle],
  ];
  const { percentage, missingFields } = profile.profileCompletion;

  return (
    <article className="card profile-view">
      <header className="profile-view__header">
        <Avatar src={profile.profilePhotoUrl} name={profile.name} />
        <div>
          <h1>{profile.name}</h1>
          <p className="muted">{[profile.age && `${profile.age} years`, profile.location].filter(Boolean).join(' · ')}</p>
          <div className="actions">
            <Link to={USER_PATHS.PROFILE_EDIT} className="btn btn--primary">
              Edit profile
            </Link>
            <button type="button" className="btn" onClick={onChangePhoto}>
              Change photo
            </button>
          </div>
        </div>
      </header>

      <section aria-label="Profile completion" className="completion">
        <div className="completion__label">
          <span>Profile {percentage}% complete</span>
        </div>
        <div className="completion__bar" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percentage}%` }} />
        </div>
        {missingFields.length > 0 && (
          <p className="muted">Still missing: {missingFields.map((f) => FIELD_LABELS[f] || f).join(', ')}</p>
        )}
      </section>

      <dl className="details">
        {rows.map(([label, value]) => (
          <div key={label} className="details__row">
            <dt>{label}</dt>
            <dd>{value || <span className="muted">Not added</span>}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2>About me</h2>
        {profile.bio ? <p className="bio">{profile.bio}</p> : <p className="muted">Not added</p>}
      </section>
    </article>
  );
}

export default ProfileView;
