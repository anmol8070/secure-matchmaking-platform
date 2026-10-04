import { NavLink, Outlet } from 'react-router-dom';
import { ADMIN_PATHS } from '../routes/paths.js';
import { APP_NAME } from '../utils/constants.js';

const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

function AdminLayout() {
  return (
    <div className="layout layout--admin">
      <aside className="sidebar">
        <div className="brand">{APP_NAME} · Admin</div>
        <nav className="sidebar-nav">
          <NavLink to={ADMIN_PATHS.DASHBOARD} className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to={ADMIN_PATHS.LOGIN} className={navClass}>
            Admin Login
          </NavLink>
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
