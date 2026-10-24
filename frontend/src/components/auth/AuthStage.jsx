import { useLocation } from 'react-router-dom';
import { HeroFallback } from '../landing/HeroVisual.jsx';
import Icon from '../common/Icon.jsx';
import { USER_PATHS } from '../../routes/paths.js';

const COPY = {
  [USER_PATHS.REGISTER]: ['Start something real.', 'Create your account in a minute. We confirm your email or mobile with a one-time password.'],
  [USER_PATHS.OTP_VERIFICATION]: ['Almost there.', 'Enter the code we sent you to confirm it is really yours.'],
  [USER_PATHS.LOGIN]: ['Welcome back.', 'Sign in to see your matches, requests and conversations.'],
  [USER_PATHS.LOGIN_VERIFICATION]: ['One last check.', 'A quick live camera check confirms a real person is signing in.'],
};

/**
 * Two-column frame for the sign-in and sign-up pages: an illustrated panel
 * (hidden on phones) beside the form. Purely presentational.
 */
function AuthStage({ children }) {
  const { pathname } = useLocation();
  const [title, text] = COPY[pathname] || COPY[USER_PATHS.LOGIN];

  return (
    <div className="auth-stage">
      <aside className="auth-stage__art" aria-hidden="true">
        <div className="auth-stage__visual">
          <HeroFallback />
        </div>
        <p className="auth-stage__title">{title}</p>
        <p className="auth-stage__text">{text}</p>
        <ul className="auth-stage__points">
          <li>
            <Icon name="shield" size={18} /> Sign-in checks that one face is present
          </li>
          <li>
            <Icon name="eye" size={18} /> You choose who sees each detail
          </li>
          <li>
            <Icon name="lock" size={18} /> Chat and calls only with connections
          </li>
        </ul>
      </aside>
      <div className="auth-stage__form">{children}</div>
    </div>
  );
}

export default AuthStage;
