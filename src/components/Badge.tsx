import { CLASS_INFO, type Classification } from '../lib/analysis';
import { Icon } from './Icon';

export function Badge({ c, size = 18 }: { c: Classification; size?: number }) {
  const info = CLASS_INFO[c];
  return (
    <span
      className="badge"
      title={info.label}
      style={{ background: info.color, width: size, height: size, fontSize: size * (info.symbol.length > 1 ? 0.5 : 0.62) }}
    >
      {info.icon ? <Icon name={info.icon} size={Math.round(size * 0.62)} /> : info.symbol}
    </span>
  );
}
