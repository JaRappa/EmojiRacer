/**
 * Screen state machine — menu / track select / sandbox / options.
 * Uses HTML overlays for menus and delegates to the game loop for sandbox.
 */

// ─── Types ─────────────────────────────────────────────────────────

export type Screen =
  | { kind: 'menu' }
  | { kind: 'trackSelect' }
  | { kind: 'sandbox' }
  | { kind: 'options' };

export type TrackEntry = {
  id: string;
  name: string;
  description: string;
  emoji: string;
};

type ScreenChangeCallback = (screen: Screen) => void;

// ─── Globals ───────────────────────────────────────────────────────

/** Available tracks for the track selection screen. */
const TRACKS: TrackEntry[] = [
  {
    id: 'sandbox',
    name: 'Sandbox Track',
    description: 'Open field with border walls — free drive.',
    emoji: '🏟️',
  },
];

let currentScreen: Screen = { kind: 'menu' };
let onScreenChange: ScreenChangeCallback | null = null;

// ─── HTML element references (set once at init) ─────────────────────

let menuEl: HTMLElement;
let trackSelectEl: HTMLElement;
let optionsEl: HTMLElement;

// ─── Button builders ────────────────────────────────────────────────

function ce<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

// ─── Main menu ──────────────────────────────────────────────────────

function buildMenu(): HTMLElement {
  const wrap = ce('div', 'screen menu-screen');
  wrap.id = 'menu-screen';

  const content = ce('div', 'menu-content');

  const title = ce('h1', 'menu-title', '🏁 Emoji Racer');
  const subtitle = ce('p', 'menu-subtitle', 'Top-down 2D racing');

  const btnTracks = ce('button', 'menu-btn', '🏆 Tracks');
  btnTracks.addEventListener('click', () => navigate({ kind: 'trackSelect' }));

  const btnSandbox = ce('button', 'menu-btn', '🏎️ Sandbox');
  btnSandbox.addEventListener('click', () => navigate({ kind: 'sandbox' }));

  const btnOptions = ce('button', 'menu-btn', '⚙️ Options');
  btnOptions.addEventListener('click', () => navigate({ kind: 'options' }));

  const footer = ce('p', 'menu-footer', 'v0.1.0 · Phase 1');

  content.appendChild(title);
  content.appendChild(subtitle);
  content.appendChild(btnTracks);
  content.appendChild(btnSandbox);
  content.appendChild(btnOptions);
  content.appendChild(footer);
  wrap.appendChild(content);

  return wrap;
}

// ─── Track select screen ────────────────────────────────────────────

function buildTrackSelect(): HTMLElement {
  const wrap = ce('div', 'screen track-select-screen');
  wrap.id = 'track-select-screen';

  const content = ce('div', 'menu-content');

  const title = ce('h2', 'menu-title', '🏆 Select Track');

  const list = ce('div', 'track-list');

  for (const track of TRACKS) {
    const card = ce('div', 'track-card');
    card.addEventListener('click', () => {
      // For now, all tracks launch sandbox
      navigate({ kind: 'sandbox' });
    });

    const emoji = ce('span', 'track-emoji', track.emoji);
    const info = ce('div', 'track-info');
    const name = ce('h3', 'track-name', track.name);
    const desc = ce('p', 'track-desc', track.description);

    info.appendChild(name);
    info.appendChild(desc);
    card.appendChild(emoji);
    card.appendChild(info);
    list.appendChild(card);
  }

  const backBtn = ce('button', 'menu-btn back-btn', '← Back');
  backBtn.addEventListener('click', () => navigate({ kind: 'menu' }));

  content.appendChild(title);
  content.appendChild(list);
  content.appendChild(backBtn);
  wrap.appendChild(content);

  return wrap;
}

// ─── Options screen ─────────────────────────────────────────────────

function buildOptions(): HTMLElement {
  const wrap = ce('div', 'screen options-screen');
  wrap.id = 'options-screen';

  const content = ce('div', 'menu-content');

  const title = ce('h2', 'menu-title', '⚙️ Options');

  const placeholder = ce('p', 'options-placeholder', 'More options coming soon!');

  const backBtn = ce('button', 'menu-btn back-btn', '← Back');
  backBtn.addEventListener('click', () => navigate({ kind: 'menu' }));

  content.appendChild(title);
  content.appendChild(placeholder);
  content.appendChild(backBtn);
  wrap.appendChild(content);

  return wrap;
}

// ─── Screen visibility ──────────────────────────────────────────────

function showOnly(id: string | null): void {
  [menuEl, trackSelectEl, optionsEl].forEach((el) => {
    if (el) el.style.display = (el.id === id) ? 'flex' : 'none';
  });
}

// ─── Navigation ─────────────────────────────────────────────────────

export function navigate(screen: Screen): void {
  const prev = currentScreen;
  currentScreen = screen;

  switch (screen.kind) {
    case 'menu':
      showOnly('menu-screen');
      break;
    case 'trackSelect':
      showOnly('track-select-screen');
      break;
    case 'options':
      showOnly('options-screen');
      break;
    case 'sandbox':
      // Hide all menu overlays, show game canvas
      showOnly(null);
      break;
  }

  if (onScreenChange) {
    onScreenChange(screen);
  }
}

// ─── Init ───────────────────────────────────────────────────────────

export function initScreens(
  container: HTMLElement,
  onNavigate: ScreenChangeCallback,
): void {
  onScreenChange = onNavigate;

  // Build and inject screens
  menuEl = buildMenu();
  trackSelectEl = buildTrackSelect();
  optionsEl = buildOptions();

  container.appendChild(menuEl);
  container.appendChild(trackSelectEl);
  container.appendChild(optionsEl);

  // Start on menu
  navigate({ kind: 'menu' });
}

// ─── Public API ─────────────────────────────────────────────────────

export function getScreen(): Screen {
  return currentScreen;
}

export function getTracks(): TrackEntry[] {
  return TRACKS;
}
