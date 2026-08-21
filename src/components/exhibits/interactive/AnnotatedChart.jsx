import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  Tooltip,
} from 'recharts';

// Recharts pinta con atributos SVG, donde `var(--ink)` no se resuelve, así que
// los colores tienen que llegar como cadenas. Estaban fijos en la paleta clara;
// desde que existe el modo oscuro eso pintaba tinta oscura sobre fondo oscuro.
// Los leemos del propio documento y los releemos si cambia el esquema.
const FALLBACK = {
  ink: '#1A1A1A',
  muted: '#5C5C5C',
  rule: '#C8C2B5',
  accent: '#7A1F1F',
  bg: '#F4EDE0',
};

function readTokens() {
  if (typeof window === 'undefined') return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return {
    ink: pick('--ink', FALLBACK.ink),
    muted: pick('--muted', FALLBACK.muted),
    rule: pick('--rule-soft', FALLBACK.rule),
    accent: pick('--accent', FALLBACK.accent),
    bg: pick('--bg', FALLBACK.bg),
  };
}

function useChartColors() {
  const [colors, setColors] = useState(FALLBACK);
  useEffect(() => {
    const sync = () => setColors(readTokens());
    sync();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    // El conmutador explícito escribe data-theme en <html>.
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', sync); obs.disconnect(); };
  }, []);
  return colors;
}

function CustomTooltip({ active, payload, xKey, yLabel }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-x">{p.payload[xKey]}</div>
      <div className="chart-tooltip-y">
        {yLabel ? `${yLabel}: ` : ''}{p.value}
      </div>
    </div>
  );
}

export default function AnnotatedChart({
  label = 'Chart',
  title,
  subtitle,
  source,
  data = [],
  xKey = 'x',
  yKey = 'y',
  yLabel = '',
  type = 'line',
  annotations = [],
  height = 320,
}) {
  const [activeAnn, setActiveAnn] = useState(null);
  const COLORS = useChartColors();
  const ChartCmp = type === 'area' ? AreaChart : LineChart;

  return (
    <figure className="exhibit">
      <div className="exhibit-frame">
        <div className="exhibit-label">{label}</div>
        {title && <div className="exhibit-title">{title}</div>}
        {subtitle && <div className="exhibit-subtitle">{subtitle}</div>}
        <div className="chart-wrapper" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ChartCmp data={data} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid stroke={COLORS.rule} strokeDasharray="2 4" strokeOpacity={0.5} />
              <XAxis
                dataKey={xKey}
                tick={{ fill: COLORS.muted, fontSize: 11, fontFamily: "'IBM Plex Sans', sans-serif" }}
                stroke={COLORS.ink}
                strokeWidth={0.8}
              />
              <YAxis
                tick={{ fill: COLORS.muted, fontSize: 11, fontFamily: "'IBM Plex Sans', sans-serif" }}
                stroke={COLORS.ink}
                strokeWidth={0.8}
              />
              {type === 'area' ? (
                <Area type="monotone" dataKey={yKey} stroke={COLORS.ink} strokeWidth={1.5} fill={COLORS.accent} fillOpacity={0.12} />
              ) : (
                <Line type="monotone" dataKey={yKey} stroke={COLORS.ink} strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: COLORS.accent, stroke: 'none' }} />
              )}
              {annotations.map((a, i) => (
                <ReferenceDot
                  key={i}
                  x={a.x}
                  y={a.y}
                  r={6}
                  fill={activeAnn === i ? COLORS.accent : COLORS.bg}
                  stroke={COLORS.accent}
                  strokeWidth={1.5}
                  onClick={() => setActiveAnn(activeAnn === i ? null : i)}
                  onMouseEnter={() => setActiveAnn(i)}
                  style={{ cursor: 'pointer' }}
                />
              ))}
              <Tooltip content={<CustomTooltip xKey={xKey} yLabel={yLabel} />} />
            </ChartCmp>
          </ResponsiveContainer>
        </div>
        {annotations.length > 0 && (
          <ol className="chart-annotations">
            {annotations.map((a, i) => (
              <li
                key={i}
                className={`chart-annotation${activeAnn === i ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveAnn(i)}
                onMouseLeave={() => setActiveAnn(null)}
                onClick={() => setActiveAnn(activeAnn === i ? null : i)}
              >
                <span className="chart-annotation-marker" aria-hidden="true"></span>
                <span className="chart-annotation-x">{a.x}</span>
                <span className="chart-annotation-label">{a.label}</span>
                {a.description && activeAnn === i && (
                  <span className="chart-annotation-desc">{a.description}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {source && <div className="exhibit-source"><strong>Source.</strong> {source}</div>}
      </div>
    </figure>
  );
}
