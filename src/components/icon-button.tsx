import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  icon: SymbolViewProps['name'];
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
      <SymbolView name={icon} size={26} tintColor={color ?? theme.text} />
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
