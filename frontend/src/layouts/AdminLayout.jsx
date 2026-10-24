import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import { ADMIN_PATHS } from '../routes/paths.js';
import PageLoading from '../components/common/PageLoading.jsx';
import BrandMark from '../components/common/BrandMark.jsx';
import Icon from '../components/common/Icon.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';

const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

const ADMIN_LINKS = [
  { to: ADMIN_PATHS.DASHBOARD, label: 'Dashboard', icon: 'chart' },
  { to: ADMIN_PATHS.USERS, label: 'Users', icon: 'users' },
  { to: ADMIN_PATHS.REPORTS, label: 'Reports', icon: 'flag' },
  { to: ADMIN_PATHS.ACTIVITY, label: 'Activity', icon: 'clock' },
  { to: ADMIN_PATHS.ML, label: 'ML monitoring', icon: 'cpu' },
];

/** Operational layout: a fixed sidebar and a quiet header — no marketing visuals. */
function AdminLayout() {
  const { isAdmin, logout, user } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="layout layout--admin">
      <a href="#admin-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <BrandMark suffix="Admin" />
        </div>
        <nav className="sidebar-nav" aria-label="Admin">
          {isAdmin ? (
            <>
              {ADMIN_LINKS.map((link) => (
                <NavLink key={link.to} to={link.to} className={navClass}>
                  <Icon name={link.icon} />
                  <span>{link.label}</span>
                </NavLink>
              ))}
              <button type="button" className="nav-link nav-button" onClick={logout}>
                <Icon name="logout" />
                <span>Log out</span>
              </button>
            </>
          ) : (
            <NavLink to={ADMIN_PATHS.LOGIN} className={navClass}>
              <Icon name="lock" />
              <span>Admin Login</span>
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          {isAdmin && <span className="muted admin-header__who">Signed in as {user?.email || user?.mobile}</span>}
          <ThemeToggle />
        </header>
        <main id="admin-content" className="content content--admin" tabIndex={-1}>
          <div key={pathname} className="page-enter">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
