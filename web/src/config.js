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

/**
 * Zeitraum beim Oeffnen des Dashboards (Preset-Schluessel aus dem Kalender).
 * Ein enger Zeitraum laedt schneller: die Meta-API liefert dann nur die
 * gewaehlten Tage statt der vollen 90 Tage Lookback.
 */
export const DEFAULT_RANGE = PROJECT.defaults?.range || 'maximum';

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

/**
 * Nicht jede Kampagne hat eine Umfrage. quality.campaignMatch in
 * project.config.json sagt, welche. Bei allen anderen werden die
 * Qualitaets-Kennzahlen gar nicht erst angezeigt - ein dauerhaftes "-" in
 * jeder Zeile sieht nach kaputt aus, nicht nach "gibt es hier nicht".
 * Leere Liste = alle Kampagnen (kein Scope konfiguriert).
 */
const QUALITY_MATCH = (PROJECT.quality?.campaignMatch || []).map((p) => String(p).toLowerCase());

export function hasQualityForCampaign(name) {
  if (!hasQuality) return false;
  if (!QUALITY_MATCH.length) return true;
  const hay = String(name ?? '').toLowerCase();
  return QUALITY_MATCH.some((p) => hay.includes(p));
}

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
/** Relative Helligkeit nach WCAG (0 = schwarz, 1 = weiss). */
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

const rgbList = (hex) => { const { r, g, b } = hexToRgb(hex); return `${r}, ${g}, ${b}`; };
/** Mischt Richtung Weiss/Schwarz und liefert die Kanaele als "r, g, b". */
const shadeList = (hex, amount) => rgbList(shade(hex, amount));

export function applyBranding(branding = BRANDING) {
  const accent = branding.accent || '#d0bb5a';
  const surface = branding.surface || '';
  const background = branding.background || '';
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);

  // --- Akzent -------------------------------------------------------------
  // --accent-rgb traegt das halbe Theme: styles.css baut daraus jede Linie,
  // jeden Glow und jede getoente Flaeche.
  set('--accent-rgb', rgbList(accent));
  set('--accent', accent);
  set('--accent-2', shade(accent, 0.34));
  set('--accent-deep', shade(accent, -0.28));
  set('--accent-hover', shade(accent, 0.34));
  set('--accent-ink', shade(accent, 0.46));
  set('--accent-soft', rgba(accent, 0.14));
  set('--line', rgba(accent, 0.12));
  set('--line-strong', rgba(accent, 0.26));
  set('--glow', `0 0 0 1px ${rgba(accent, 0.3)}, 0 10px 44px ${rgba(accent, 0.18)}`);
  set('--accent-grad', 'linear-gradient(135deg, var(--accent-2), var(--accent) 55%, var(--accent-deep))');
  // Text auf Akzentflaechen (Buttons, aktive Tabs): dunkel auf hellen
  // Akzenten wie Gold, weiss auf kraeftigen wie Rot oder Blau. Vorher war das
  // fest auf dunkel verdrahtet - auf einem dunklen Akzent unlesbar.
  set('--on-accent', luminance(accent) > 0.45 ? '#141005' : '#ffffff');

  // --- Hintergrund --------------------------------------------------------
  // Die Seite selbst. --deep-rgb ist der vertiefte Ton darunter (Eingabe-
  // felder, Anzeigenzeilen), damit sie sich vom Panel abheben.
  if (background) {
    set('--bg', background);
    set('--bg-rgb', rgbList(background));
    set('--deep-rgb', shadeList(background, -0.5));
    set('--bg-2', shade(background, 0.02));
  }

  // --- Flaechenton --------------------------------------------------------
  // Die zweite CI-Farbe traegt die erhabenen Flaechen (Karten, Sidebar,
  // Topbar). Ohne eigenen Hintergrund faerbt sie wie bisher auch die Seite,
  // damit bestehende Configs sich nicht veraendern.
  if (surface) {
    set('--panel-rgb', shadeList(surface, -0.28));
    set('--panel', rgba(shade(surface, -0.28), 0.72));
    set('--panel-solid', shade(surface, -0.28));
    set('--bg-elevated', shade(surface, -0.45));
    if (!background) {
      set('--bg-2', shade(surface, -0.72));
      set('--bg', shade(surface, -0.82));
      set('--bg-rgb', shadeList(surface, -0.82));
      set('--deep-rgb', shadeList(surface, -0.9));
    }
  }

  // Adressleiste auf Mobilgeraeten mitfaerben.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', background || shade(surface || accent, -0.82));
}

export const _internal = { shade, rgba, hexToRgb, luminance };
