import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * Multi-select of list items by id. A non-empty selection is "selection mode": a long press
 * starts it, taps toggle items, and it ends on clear, on Android back, or when the last item is
 * deselected.
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selecting = selected.size > 0;

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Android back leaves selection mode instead of leaving the screen.
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        clear();
        return true;
      });
      return () => sub.remove();
    }, [selecting, clear]),
  );

  return { selected, selecting, toggle, clear };
}
