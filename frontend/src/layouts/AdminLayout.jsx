import { NavLink, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import { ADMIN_PATHS } from '../routes/paths.js';
import { APP_NAME } from '../utils/constants.js';

const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

function AdminLayout() {
  const { isAdmin, logout } = useAuth();

  return (
    <div className="layout layout--admin">
      <aside className="sidebar">
        <div className="brand">{APP_NAME} · Admin</div>
        <nav className="sidebar-nav">
          {isAdmin ? (
            <>
              <NavLink to={ADMIN_PATHS.DASHBOARD} className={navClass}>
                Dashboard
              </NavLink>
              <button type="button" className="nav-link nav-button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to={ADMIN_PATHS.LOGIN} className={navClass}>
              Admin Login
            </NavLink>
          )}
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
