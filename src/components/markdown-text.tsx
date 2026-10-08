import { Fragment } from 'react';
import { useColorScheme } from 'react-native';
import { useMarkdown } from 'react-native-marked';

/**
 * Renders markdown as plain React Native views, so it can sit inside any layout
 * (react-native-marked's default <Markdown> is its own FlatList and can't be nested in one).
 */
export function MarkdownText({ value, selectable = true }: { value: string; selectable?: boolean }) {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const elements = useMarkdown(value, { colorScheme, selectable });
  return elements.map((element, i) => <Fragment key={i}>{element}</Fragment>);
}
