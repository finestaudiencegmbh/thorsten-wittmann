/**
 * Projekt-Config im Frontend.
 *
 * Die Datei wird direkt importiert (Vite loest JSON-Importe nativ auf), damit
 * Name, Logo und Akzentfarbe schon beim ersten Render stehen und nicht erst
 * nach dem ersten API-Call nachflackern. Der Server schickt dieselben Werte
 * zusaetzlich im /api/data-Payload mit — daran laesst sich erkennen, wenn ein
 * Deploy mit veralteter Config gebaut wurde.
 */
import projectConfig from '../../project.config.json';

export const PROJECT = projectConfig || {};
export const FEATURES = PROJECT.features || {};
export const BRANDING = PROJECT.branding || {};
export const FUNNELS = PROJECT.funnels || [];
export const TRAFFIC_SOURCES = PROJECT.trafficSources || [];

export const hasTickets = Boolean(FEATURES.hasTickets);
export const hasQuality = Boolean(FEATURES.hasQuality);
export const hasFunnels = FUNNELS.length > 0;

/** Nur die Traffic-Quellen, fuer die es echte Kostendaten gibt (heute: Meta). */
export const spendSources = TRAFFIC_SOURCES.filter((s) => s.hasSpend);

/**
 * Welche Auswertungs-Dimensionen hat dieses Sheet? Eine Dimension ohne
 * zugeordnetes UTM-Feld (sheet.utmMapping) hat keine Datengrundlage - der
 * Reiter dafuer wuerde nur eine "(kein ...)"-Zeile zeigen und wird ausgeblendet.
 */
const UTM_MAPPING = PROJECT.sheet?.utmMapping || {
  campaign: 'utmCampaign', adset: 'utmSource', creative: 'utmMedium', placement: 'utmTerm',
};
export const hasDimension = (key) => Boolean(UTM_MAPPING[key]);

// ---- Farbableitung ---------------------------------------------------------
// Aus EINER Akzentfarbe werden alle Abstufungen berechnet, damit ein neues
// Projekt nur einen Hex-Wert pflegen muss.

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 208, g: 187, b: 90 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ({ r, g, b }) => `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

/** Mischt eine Farbe Richtung Weiss (amount > 0) bzw. Schwarz (amount < 0). */
function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  return toHex({ r: r + (t - r) * p, g: g + (t - g) * p, b: b + (t - b) * p });
}

const rgba = (hex, a) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Setzt die CSS-Custom-Properties aus der Config. styles.css definiert die
 * Fallback-Werte; hier werden sie zur Laufzeit ueberschrieben.
 */
export function applyBranding(branding = BRANDING) {
  const accent = branding.accent || '#d0bb5a';
  const surface = branding.surface || '';
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);

  set('--accent', accent);
  set('--accent-2', shade(accent, 0.28));
  set('--accent-deep', shade(accent, -0.28));
  set('--accent-hover', shade(accent, 0.28));
  set('--accent-soft', rgba(accent, 0.14));
  set('--accent-ink', shade(accent, 0.42));
  set('--line', rgba(accent, 0.12));
  set('--line-strong', rgba(accent, 0.26));
  set('--glow', `0 0 0 1px ${rgba(accent, 0.3)}, 0 10px 44px ${rgba(accent, 0.18)}`);

  // Zweite CI-Farbe als Flaechenton: hebt Panels vom Hintergrund ab, ohne
  // dem Akzent Konkurrenz zu machen.
  if (surface) {
    set('--panel', rgba(surface, 0.42));
    set('--panel-solid', shade(surface, -0.45));
    set('--bg-elevated', shade(surface, -0.55));
    set('--bg-2', shade(surface, -0.72));
    set('--bg', shade(surface, -0.82));
  }
  set('--brand-accent-rgb', (({ r, g, b }) => `${r}, ${g}, ${b}`)(hexToRgb(accent)));
}

export const _internal = { shade, rgba, hexToRgb };
