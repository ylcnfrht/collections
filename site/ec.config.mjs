import { defineEcConfig } from '@astrojs/starlight/expressive-code';

export default defineEcConfig({
  themes: ['github-dark-default', 'github-light'],
  styleOverrides: {
    borderRadius: '12px',
    borderColor: 'var(--rp-hairline)',
    codeFontFamily: "'Geist Mono Variable', ui-monospace, monospace",
    codeFontSize: '0.84rem',
    codeLineHeight: '1.7',
    codeBackground: 'var(--rp-code-bg)',
    uiFontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
    frames: {
      shadowColor: 'transparent',
      editorTabBarBackground: 'var(--rp-surface)',
      editorActiveTabBackground: 'var(--rp-code-bg)',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'var(--sl-color-accent)',
      editorTabBarBorderBottomColor: 'var(--rp-hairline)',
      terminalTitlebarBackground: 'var(--rp-surface)',
      terminalBackground: 'var(--rp-code-bg)',
      frameBoxShadowCssValue: 'none',
    },
  },
});
