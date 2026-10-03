export const tokens = {
  color: {
    bg: '#FBFBFA',
    panel: '#FFFFFF',
    border: '#E9E9E7',
    borderStrong: '#D9D9D6',
    text: '#1F1F1F',
    muted: '#787774',
    faint: '#A5A5A2',
    hover: '#F1F1EF',
    accent: '#2F6FEB',
    accentSoft: 'rgba(47, 111, 235, 0.14)',
    accentFaint: 'rgba(47, 111, 235, 0.07)',
    danger: '#D44C47',
  },
  font: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    size: { xs: 11, sm: 12, md: 14, lg: 16 },
    weight: { regular: '400', medium: '500', semibold: '600' },
  },
  radius: { sm: 4, md: 6, lg: 8 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
  shadow: {
    popover: '0 8px 24px rgba(15, 15, 15, 0.12), 0 0 0 1px rgba(15, 15, 15, 0.05)',
    drag: '0 4px 12px rgba(15, 15, 15, 0.16)',
  },
  motion: { fast: '120ms', base: '150ms' },
} as const;
