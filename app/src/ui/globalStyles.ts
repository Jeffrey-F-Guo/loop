import { tokens } from './tokens';

const STYLE_ID = 'sprint-global-styles';

export function injectGlobalStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
  document.head.appendChild(font);
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; }
    body {
      background: ${tokens.color.bg};
      color: ${tokens.color.text};
      font-family: ${tokens.font.family};
      font-size: ${tokens.font.size.md}px;
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
    input, textarea, button, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
  `;
  document.head.appendChild(style);
}
