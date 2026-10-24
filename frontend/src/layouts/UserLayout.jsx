import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import useActivityCounts from '../hooks/useActivityCounts.js';
import { USER_PATHS } from '../routes/paths.js';
import { APP_NAME } from '../utils/constants.js';
import IncomingCall from '../components/video/IncomingCall.jsx';
import PageLoading from '../components/common/PageLoading.jsx';
import BrandMark from '../components/common/BrandMark.jsx';
import Icon from '../components/common/Icon.jsx';
import ThemeToggle from '../components/common/ThemeToggle.jsx';
import AuthStage from '../components/auth/AuthStage.jsx';
import ApiStatus from '../components/common/ApiStatus.jsx';
import { AUTH_STATUS } from '../context/authReducer.js';

const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

// Grouped for the sidebar. `end`: Connections must not stay active on
// /connections/requests, which has its own link.
const MEMBER_GROUPS = [
  {
    label: 'Discover',
    links: [
      { to: USER_PATHS.DASHBOARD, label: 'Dashboard', icon: 'home' },
      { to: USER_PATHS.MATCHES, label: 'Discover', icon: 'compass' },
      { to: USER_PATHS.CONNECTIONS, label: 'Connections', icon: 'users', end: true },
      { to: USER_PATHS.CONNECTION_REQUESTS, label: 'Requests', icon: 'inbox' },
    ],
  },
  {
    label: 'Talk',
    links: [
      { to: USER_PATHS.MESSAGES, label: 'Messages', icon: 'message' },
      { to: USER_PATHS.CALLS, label: 'Calls', icon: 'video' },
    ],
  },
  {
    label: 'You',
    links: [
      { to: USER_PATHS.PROFILE, label: 'Profile', icon: 'user' },
      { to: USER_PATHS.PREFERENCES, label: 'Preferences', icon: 'sliders' },
      { to: USER_PATHS.PRIVACY, label: 'Privacy', icon: 'shield' },
    ],
  },
];

// Landing-page sections (hash links) and the two account pages.
const GUEST_SECTIONS = [
  { hash: '#explore', label: 'Explore' },
  { hash: '#how-it-works', label: 'How it works' },
  { hash: '#features', label: 'Features' },
  { hash: '#safety', label: 'Safety' },
  { hash: '#faq', label: 'FAQ' },
];

const AUTH_PAGES = new Set([USER_PATHS.LOGIN, USER_PATHS.REGISTER, USER_PATHS.OTP_VERIFICATION, USER_PATHS.LOGIN_VERIFICATION]);

/** Below the desktop breakpoint the links collapse behind a menu button. */
function useMenu(pathname) {
  const [open, setOpen] = useState(false);
  const skipInitialClose = useRef(true);
  // Close after a navigation, not on the first render. Closing on mount races
  // with the click that opens the menu when another update is still pending.
  useEffect(() => {
    if (skipInitialClose.current) {
      skipInitialClose.current = false;
      return;
    }
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return [open, setOpen];
}

function MenuButton({ open, onToggle }) {
  return (
    <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="main-nav" onClick={onToggle}>
      <Icon name={open ? 'close' : 'menu'} />
      {open ? 'Close' : 'Menu'}
    </button>
  );
}

function Page() {
  const { pathname } = useLocation();
  return (
    // Keyed by path so each page plays the entrance animation once.
    <div key={pathname} className="page-enter">
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

function MemberShell() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useMenu(pathname);
  const { requests, unread } = useActivityCounts();
  const badges = {
    [USER_PATHS.CONNECTION_REQUESTS]: requests,
    [USER_PATHS.MESSAGES]: unread,
  };

  return (
    <div className={`layout layout--member${menuOpen ? ' layout--menu-open' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="member-topbar">
        <Link to={USER_PATHS.DASHBOARD} className="brand" aria-label={`${APP_NAME} dashboard`}>
          <BrandMark />
        </Link>
        <div className="member-topbar__tools">
          <ThemeToggle />
          <MenuButton open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} />
        </div>
      </header>

      <aside className="member-sidebar">
        <Link to={USER_PATHS.DASHBOARD} className="brand member-sidebar__brand" aria-label={`${APP_NAME} dashboard`}>
          <BrandMark />
        </Link>
        <nav id="main-nav" className={`nav nav--member${menuOpen ? ' nav--open' : ''}`} aria-label="Main">
          {MEMBER_GROUPS.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-group__label" aria-hidden="true">
                {group.label}
              </p>
              {group.links.map((link) => {
                const badge = badges[link.to];
                return (
                  <NavLink key={link.to} to={link.to} end={link.end} className={navClass}>
                    <Icon name={link.icon} />
                    <span>{link.label}</span>
                    {badge ? (
                      <span className="nav-badge" aria-hidden="true">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="nav-group nav-group--footer">
            <ThemeToggle className="member-sidebar__theme" />
            <button type="button" className="nav-link nav-button" onClick={logout}>
              <Icon name="logout" />
              <span>Log out</span>
            </button>
          </div>
        </nav>
      </aside>
      <button type="button" className="nav-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setMenuOpen(false)} />

      <main id="main-content" className="content content--member" tabIndex={-1}>
        <Page />
      </main>

      {/* Rings for incoming video calls on any page (Phase 12). */}
      <IncomingCall />
    </div>
  );
}

function PublicShell() {
  const { isAuthenticated, status } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useMenu(pathname);
  const isLanding = pathname === USER_PATHS.HOME;
  const isAuthPage = AUTH_PAGES.has(pathname);
  // While a stored session is being restored, don't flash "Log in" at a member.
  const restoring = status === AUTH_STATUS.AUTH_PENDING && !isAuthPage;

  return (
    <div className={`layout layout--public${isLanding ? ' layout--landing' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="public-header">
        <div className="public-nav">
          <Link to={USER_PATHS.HOME} className="brand" aria-label={`${APP_NAME} home`}>
            <BrandMark />
          </Link>
          <MenuButton open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} />
          <nav id="main-nav" className={`nav nav--public${menuOpen ? ' nav--open' : ''}`} aria-label="Main">
            <div className="nav-sections">
              {GUEST_SECTIONS.map((section) => (
                <Link key={section.hash} to={{ pathname: USER_PATHS.HOME, hash: section.hash }} className="nav-link">
                  {section.label}
                </Link>
              ))}
            </div>
            <div className="nav-actions">
              <ThemeToggle />
              {restoring ? null : isAuthenticated ? (
                <Link to={USER_PATHS.DASHBOARD} className="btn btn--primary btn--small">
                  Dashboard
                </Link>
              ) : (
                <>
                  <NavLink to={USER_PATHS.LOGIN} className={navClass}>
                    Log in
                  </NavLink>
                  <NavLink to={USER_PATHS.REGISTER} className={({ isActive }) => `btn btn--primary btn--small${isActive ? ' active' : ''}`}>
                    Sign up
                  </NavLink>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main id="main-content" className={`content${isLanding ? ' content--landing' : ''}`} tabIndex={-1}>
        {isAuthPage ? (
          <AuthStage>
            <Page />
          </AuthStage>
        ) : (
          <Page />
        )}
      </main>

      {isAuthenticated && <IncomingCall />}

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <BrandMark />
            <p className="muted">Secure social networking and digital matchmaking.</p>
          </div>
          <nav aria-label="Footer" className="site-footer__links">
            {GUEST_SECTIONS.map((section) => (
              <Link key={section.hash} to={{ pathname: USER_PATHS.HOME, hash: section.hash }}>
                {section.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <Link to={USER_PATHS.DASHBOARD}>Dashboard</Link>
            ) : (
              <>
                <Link to={USER_PATHS.LOGIN}>Log in</Link>
                <Link to={USER_PATHS.REGISTER}>Create account</Link>
              </>
            )}
          </nav>
          <ApiStatus />
          <p className="site-footer__copy">
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
      </footer>
    </div>
  );
}

function UserLayout() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  // The landing page keeps its own full-width layout for members too.
  return isAuthenticated && pathname !== USER_PATHS.HOME ? <MemberShell /> : <PublicShell />;
}

export default UserLayout;
