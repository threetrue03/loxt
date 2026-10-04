import Menu from './Menu.jsx';
import Icon from './Icon.jsx';
export default function Select({ label, value, options, onChange, disabled = false, className = '', upward = false }) {
  const selected = options.find(option => String(option.value) === String(value));
  const groups = [...new Set(options.map(option => option.group))];
  const ordered = groups.flatMap(group => options.filter(option => option.group === group));
  return <Menu label={label} disabled={disabled} upward={upward} className={`custom-select ${className}`} trigger={<><span>{selected?.label || '선택하세요'}</span><Icon name="chevronDown"/></>}>{close => ordered.map((option,index) => {
    const group = option.group !== ordered[index-1]?.group ? option.group : null;
    return <div key={option.value}>{group ? <div className="menu-group-label">{group}</div> : null}<button role="menuitemradio" aria-checked={String(value) === String(option.value)} disabled={option.disabled} onClick={() => { close(); onChange(option.value); }}><span>{option.label}</span>{String(value) === String(option.value) ? <span className="menu-check">✓</span> : null}</button></div>;
  })}</Menu>;
}
