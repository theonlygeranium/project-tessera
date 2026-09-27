import type { Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import '../../docs/assets/tokens.css';
import '../../docs/assets/ai-voice.css';
import './preview.css';

const AI_STYLES = ['marginalia', 'tabs', 'perforated', 'tiles'] as const;

const preview: Preview = {
  parameters: {
    layout: 'padded',
    // Accessibility violations fail the story's a11y check (D-010).
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
  globalTypes: {
    aiStyle: {
      description: 'AI visual language (D-006)',
      toolbar: {
        title: 'AI style',
        icon: 'paintbrush',
        items: AI_STYLES.map((s) => ({ value: s, title: s === 'marginalia' ? 'Marginalia (current)' : s })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { aiStyle: 'marginalia' },
  decorators: [
    (Story, context) => {
      const style = (context.globals.aiStyle as string) || 'marginalia';
      useEffect(() => {
        document.documentElement.setAttribute('data-ai-style', style);
      }, [style]);
      return <Story />;
    },
  ],
  tags: ['autodocs'],
};

export default preview;
