// One-time migration of the existing stylesheet. Dark values stay byte-for-byte
// equivalent; light colors are assigned by their role, never by inverting pixels.
import postcss from 'postcss';
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile('src/styles.css', 'utf8');
if (source.includes("@import './theme-colors.css'")) throw new Error('Theme colors already migrated');
const css = postcss.parse(source);
const tokens = new Map();
const names = {
  'surface:#191919': 'surface-sidebar', 'surface:#1e1e1e': 'surface-header',
  'surface:#232323': 'surface-main', 'surface:#252525': 'surface-script',
  'surface:#2b2d2c': 'surface-card', 'surface:#282827': 'surface-control',
  'surface:#262624': 'surface-dialog', 'surface:#2d2d2b': 'surface-menu',
  'surface:#eeeeda': 'surface-primary', 'surface:#ffffed': 'surface-primary-hover',
  'surface:#30302f': 'surface-hover', 'surface:#303a3f': 'surface-selected',
  'text:#f2f2ef': 'text-main', 'text:#eeeeeb': 'text-panel', 'text:#dededa': 'text-control',
  'text:#c0c0ba': 'text-muted', 'text:#292a25': 'text-on-primary',
  'text:#e5afa2': 'text-danger', 'accent:#b5d8e9': 'accent-blue',
  'accent:#b5cec0': 'accent-green', 'border:#333332': 'border-subtle',
  'border:#444641': 'border-card', 'border:#484844': 'border-control',
};
const surfaces = {
  '#0008': '#20282038', '#191919': '#ECEDE9', '#1e1e1e': '#ECEDE9',
  '#222321': '#FFFFFF', '#232323': '#F6F6F4', '#232322': '#FFFFFF',
  '#252523': '#FFFFFF', '#252524': '#FFFFFF', '#252525': '#FFFFFF',
  '#262624': '#FFFFFF', '#262625': '#F0F2ED', '#272725': '#FFFFFF', '#272727': '#FFFFFF',
  '#282827': '#FFFFFF', '#292927': '#F0F2ED', '#292928': '#F0F2ED', '#292b27': '#EEF2EC',
  '#292c2c': '#E7EEF0', '#2b2b2a': '#DDE1DA', '#2b2d2c': '#FFFFFF', '#2c2c29': '#F0F2ED', '#2d2d2b': '#FFFFFF',
  '#30302c': '#E5EDE5', '#30302e': '#E9ECE6', '#30302f': '#E1E5DD', '#30332f': '#F0F3ED',
  '#303331': '#E1E6DE', '#303332': '#DFE9E8', '#303a3f': '#E2ECEF', '#323a3b': '#E2ECEF',
  '#333027': '#F5EDD9', '#333332': '#DDE1DA', '#333937': '#FFFFFF', '#343632': '#F0F3ED',
  '#353533': '#E4E7DF', '#353a35': '#E1E6DE', '#363633': '#E1E5DD', '#382b28': '#F5E6E2',
  '#383831': '#F0F3ED', '#383836': '#E1E5DD', '#394546': '#DCE9EB', '#3b4345': '#E5EBE9',
  '#3b4940': '#E1EEE3', '#41443e': '#E1E5DD', '#444843': '#F2F5EF', '#446071': '#D9E7EC',
  '#464644': '#ABB3A6', '#484844': '#D4D7D0', '#4a302e': '#F5E6E2', '#5b3833': '#ECD6CF',
  '#858580': '#76806F', '#a9c4b1': '#4B7661', '#d9d1bd': '#DDD8C8', '#dcc1b8': '#954B40',
  '#e5afa2': '#AB4C40', '#eee': '#354F5A', '#eeeeda': '#354F5A', '#efefeb': '#E1E5DD',
  '#b5d8e91a': '#3266821a',
  '#f5f5f2': '#F0F3ED', '#ffffed': '#2B424C',
};
function expand(hex) {
  const digits = hex.slice(1); return digits.length <= 4 ? digits.split('').map(char => char + char).join('') : digits;
}
function light(role, color) {
  const full = expand(color), base = '#' + full.slice(0, 6), alpha = full.slice(6);
  const [r, g, b] = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const red = r - g > 15 && r - b > 20;
  const blue = b - r > 15;
  const green = g - r > 10 && g >= b;
  let value;
  if (role === 'surface') value = surfaces[color] || (surfaces[base] ? surfaces[base] + alpha : '#FFFFFF');
  else if (role === 'text') {
    if (color === '#dfc99a') value = '#7B642B';
    else if (['#292a25', '#262625', '#372421'].includes(color)) value = '#FFFFFF';
    else if (red) value = '#913D32';
    else if (blue) value = '#326682';
    else if (green && chroma > 18) value = '#376950';
    else if (chroma > 30 && r >= g && g > b) value = '#7B642B';
    else value = Math.max(r, g, b) >= 210 ? '#242624' : '#626660';
  } else if (role === 'border') {
    if (['#b5d8e9', '#91b3bf', '#a2c6d4'].includes(color)) value = '#326682';
    else if (color === '#eeeeda') value = '#354F5A';
    else if (color === '#bbbda9') value = '#72868B';
    else if (color === '#1e1e1e') value = '#F6F6F4';
    else value = red ? '#C8A19B' : green && chroma > 18 ? '#72927C' : '#D4D7D0';
  } else if (role === 'accent') value = green ? '#4B7661' : '#326682';
  else if (role === 'shadow') value = base === '#000000' ? '#20282014' : '#326682' + (alpha || '33');
  return value;
}
function token(role, color) {
  const key = `${role}:${color}`, name = names[key] || `${role}-${color.slice(1)}`;
  if (!tokens.has(name)) tokens.set(name, { dark: color, light: light(role, color) });
  return `var(--theme-${name})`;
}
css.walkDecls(decl => {
  const role = decl.prop === 'color' || decl.prop === '--ink' || decl.prop === '--muted' || decl.prop === '--paper-ink' ? 'text'
    : decl.prop.includes('shadow') ? 'shadow'
    : decl.prop.startsWith('border') || decl.prop.startsWith('outline') || decl.prop === '--line' ? 'border'
    : decl.prop === 'accent-color' || ['--blue', '--green'].includes(decl.prop) ? 'accent'
    : decl.prop.startsWith('background') || ['--side', '--soft', '--paper'].includes(decl.prop) ? 'surface' : null;
  if (!role) return;
  decl.value = decl.value.replace(/#[0-9a-fA-F]{3,8}\b/g, color => token(role, color.toLowerCase()));
  if (decl.prop === 'color' && decl.value === 'white') decl.value = decl.parent.selector === '::selection' ? 'var(--theme-selection-text)' : token('text', '#ffffff');
});
const vars = mode => [...tokens].map(([name, values]) => `  --theme-${name}: ${values[mode]};`).join('\n');
const palette = `/* Existing dark values and role-based light counterparts. */\n:root {\n${vars('dark')}\n  --theme-selection-text: white;\n}\nhtml[data-theme="light"] {\n  color-scheme: light;\n${vars('light')}\n  --theme-selection-text: #1E3E4F;\n}\n`;
// The document background differs from the fixed header in the light theme.
await writeFile('src/theme-colors.css', palette);
await writeFile('src/styles.css', "@import './theme-colors.css';\n" + css.toString() + '\nhtml[data-theme="light"]{color-scheme:light;--side:#F6F6F4}\n.theme-setting{max-width:620px}.live-settings .theme-setting{margin-top:28px}\n');
console.log(`Migrated ${tokens.size} color values without changing dark layout or colors.`);
