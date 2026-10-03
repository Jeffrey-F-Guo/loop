import { render, screen } from '@testing-library/react';
import { Text, View } from 'react-native';
import { describe, expect, it } from 'vitest';
import { tokens } from '../ui/tokens';

describe('test environment', () => {
  it('renders react-native primitives through react-native-web', () => {
    render(
      <View testID="root">
        <Text>hello</Text>
      </View>,
    );
    expect(screen.getByTestId('root')).toHaveTextContent('hello');
  });

  it('runs in the Los Angeles time zone', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(480);
  });

  it('exposes design tokens', () => {
    expect(tokens.color.accent).toBe('#2F6FEB');
    expect(tokens.radius.md).toBe(6);
  });
});
