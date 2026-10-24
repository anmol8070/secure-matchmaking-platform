import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import useOwnProfile from '../../hooks/useOwnProfile.js';
import useActivityCounts from '../../hooks/useActivityCounts.js';
import Avatar from '../../components/profile/Avatar.jsx';
import Icon from '../../components/common/Icon.jsx';
import { HeroFallback } from '../../components/landing/HeroVisual.jsx';
import { USER_PATHS } from '../../routes/paths.js';

/**
 * Landing page after sign-in: profile status and the way into every member
 * feature. Request and unread counts come from the same endpoints as the
 * Requests and Messages pages; if one fails to load it is simply not shown.
 */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Dashboard() {
  const { user } = useAuth();
  const { status, profile } = useOwnProfile();
  const { requests, unread } = useActivityCounts();

  const tiles = [
    {
      to: USER_PATHS.MATCHES,
      icon: 'compass',
      title: 'Recommended matches',
      text: 'People ranked for you, with the compatibility score and the reasons behind it.',
      primary: true,
    },
    {
      to: USER_PATHS.CONNECTION_REQUESTS,
      icon: 'inbox',
      title: 'Connection requests',
      text: requests ? `${plural(requests, 'request is', 'requests are')} waiting for your answer.` : 'Requests you have received and sent.',
      badge: requests || null,
    },
    {
      to: USER_PATHS.MESSAGES,
      icon: 'message',
      title: 'Messages',
      text: unread ? `${plural(unread, 'unread message', 'unread messages')}.` : 'Private chats with your connections.',
      badge: unread || null,
    },
    { to: USER_PATHS.CONNECTIONS, icon: 'users', title: 'Connections', text: 'Everyone you are connected with. Chat or start a video call.' },
    { to: USER_PATHS.CALLS, icon: 'video', title: 'Call history', text: 'Your recent video calls.' },
    { to: USER_PATHS.PREFERENCES, icon: 'sliders', title: 'Preferences', text: 'What you are looking for, your hobbies and the compatibility quiz.' },
    { to: USER_PATHS.PRIVACY, icon: 'shield', title: 'Privacy & safety', text: 'Who can see your profile, photo and online status; blocked users.' },
  ];

  return (
    <div className="stack">
      <section className="card welcome">
        <div className="welcome__orbs" aria-hidden="true">
          <HeroFallback />
        </div>
        <div className="welcome__text">
          <p className="eyebrow">Your space</p>
          <h1>Welcome{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
          <p className="muted">
            Signed in as {user?.email || user?.mobile}. Your account is {user?.status}.
          </p>
        </div>
      </section>

      {status === 'missing' && (
        <section className="card callout">
          <h2>Complete your profile</h2>
          <p className="muted">Add your details and a picture so others can get to know you. Matches need a profile.</p>
          <Link to={USER_PATHS.PROFILE_CREATE} className="btn btn--primary">
            Complete profile
          </Link>
        </section>
      )}

      {status === 'error' && (
        <p className="alert alert--error" role="alert">
          Your profile could not be loaded. Refresh the page to try again.
        </p>
      )}

      {status === 'ready' && (
        <section className="card profile-summary">
          <Avatar src={profile.profilePhotoUrl} name={profile.name} size="small" />
          <div>
            <h2>Your profile</h2>
            <p className="muted">{profile.profileCompletion.percentage}% complete</p>
          </div>
          <Link to={USER_PATHS.PROFILE} className="btn">
            View profile
          </Link>
        </section>
      )}

      <nav aria-label="Member features">
        <ul className="dashboard-tiles">
          {tiles.map((tile) => (
            <li key={tile.to}>
              <Link to={tile.to} className={`dashboard-tile${tile.primary ? ' dashboard-tile--primary' : ''}`}>
                <span className="dashboard-tile__icon" aria-hidden="true">
                  <Icon name={tile.icon} />
                </span>
                <span className="dashboard-tile__title">
                  {tile.title}
                  {tile.badge ? (
                    <span className="count-badge" aria-hidden="true">
                      {tile.badge}
                    </span>
                  ) : null}
                </span>
                <span className="dashboard-tile__text">{tile.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default Dashboard;
