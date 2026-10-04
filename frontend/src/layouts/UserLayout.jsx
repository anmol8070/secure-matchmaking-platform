import { NavLink, Outlet } from 'react-router-dom';
import { USER_PATHS } from '../routes/paths.js';
import { APP_NAME } from '../utils/constants.js';

const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

function UserLayout() {
  return (
    <div className="layout layout--user">
      <header className="topbar">
        <NavLink to={USER_PATHS.HOME} className="brand">
          {APP_NAME}
        </NavLink>
        <nav className="nav">
          <NavLink to={USER_PATHS.HOME} end className={navClass}>
            Home
          </NavLink>
          <NavLink to={USER_PATHS.LOGIN} className={navClass}>
            Login
          </NavLink>
          <NavLink to={USER_PATHS.REGISTER} className={navClass}>
            Register
          </NavLink>
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
