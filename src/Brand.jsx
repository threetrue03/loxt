import lockup from './assets/brand/LOXT-lockup-white.svg';
import symbol from './assets/brand/LOXT-symbol-white.svg';
import lightLockup from './assets/brand/LOXT-lockup-charcoal.svg';
import lightSymbol from './assets/brand/LOXT-symbol-charcoal.svg';
import { useTheme } from './ThemeProvider.jsx';
export default function Brand({ compact = false, className = '' }) {
  const { theme } = useTheme();
  return <img className={`brand-logo ${compact ? 'brand-symbol' : ''} ${className}`} src={theme === 'light' ? compact ? lightSymbol : lightLockup : compact ? symbol : lockup} alt="LOXT"/>;
}
