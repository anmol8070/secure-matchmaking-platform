import { NavLink, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import { USER_PATHS } from '../routes/paths.js';
import { APP_NAME } from '../utils/constants.js';

const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

function UserLayout() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="layout layout--user">
      <header className="topbar">
        <NavLink to={USER_PATHS.HOME} className="brand">
          {APP_NAME}
        </NavLink>
        <nav className="nav">
          {isAuthenticated ? (
            <>
              <NavLink to={USER_PATHS.DASHBOARD} className={navClass}>
                Dashboard
              </NavLink>
              <NavLink to={USER_PATHS.PROFILE} className={navClass}>
                Profile
              </NavLink>
              <NavLink to={USER_PATHS.PREFERENCES} className={navClass}>
                Preferences
              </NavLink>
              <NavLink to={USER_PATHS.MATCHES} className={navClass}>
                Matches
              </NavLink>
              <NavLink to={USER_PATHS.MESSAGES} className={navClass}>
                Messages
              </NavLink>
              <button type="button" className="nav-link nav-button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to={USER_PATHS.HOME} end className={navClass}>
                Home
              </NavLink>
              <NavLink to={USER_PATHS.LOGIN} className={navClass}>
                Login
              </NavLink>
              <NavLink to={USER_PATHS.REGISTER} className={navClass}>
                Register
              </NavLink>
            </>
          )}
        </nav>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">© {new Date().getFullYear()} {APP_NAME}</footer>
    </div>
  );
}

export default UserLayout;
