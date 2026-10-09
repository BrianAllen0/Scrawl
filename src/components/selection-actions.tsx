import { Alert } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  count: number;
  /** Singular and plural name of what's selected, e.g. ['item', 'items']. */
  noun: [string, string];
  onCancel: () => void;
  onDelete: () => void;
};

/** Title-row buttons shown in selection mode: cancel, and delete after a confirmation. */
export function SelectionActions({ count, noun, onCancel, onDelete }: Props) {
  const theme = useTheme();

  function confirmDelete() {
    Alert.alert(`Delete ${count} ${count === 1 ? noun[0] : noun[1]}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <>
      <IconButton icon="close" label="Cancel selection" onPress={onCancel} />
      <IconButton icon="delete" label={`Delete selected ${noun[1]}`} color={theme.danger} onPress={confirmDelete} />
    </>
  );
}
