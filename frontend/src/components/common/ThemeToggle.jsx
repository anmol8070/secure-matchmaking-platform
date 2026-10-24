import Icon from './Icon.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';

/** Switches between light and dark; the reveal animation starts at the button. */
function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  const onClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={onClick}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export default ThemeToggle;
