import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Icons are font glyphs, so they paint in the same frame as their row. Native symbol views draw a
 * blank frame when (re)mounted, which flashed every time the reorderable list rebuilt moved rows.
 */
export type IconName = ComponentProps<typeof MaterialIcons>['name'];

type Props = {
  icon: IconName;
  /** Read by screen readers, since the button has no visible text. */
  label: string;
  onPress: () => void;
  color?: string;
};

export function IconButton({ icon, label, onPress, color }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <MaterialIcons name={icon} size={26} color={color ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: Spacing.one,
  },
  pressed: {
    opacity: 0.5,
  },
});
