import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, TextInput, View } from 'react-native';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';

import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { saveOrder } from '@/lib/db';
import {
  addGrocery,
  deleteGroceries,
  listGroceries,
  renameGrocery,
  setGroceryQuantity,
  type Grocery,
} from '@/lib/groceries';

const AUTOSCROLL_SPEED_SCALE = 5;

export default function GroceriesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [newItem, setNewItem] = useState('');
  // Ids picked for deletion. Non-empty means selection mode: long press starts it, taps toggle
  // items, and it ends on delete, cancel, back, or deselecting the last item.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selecting = selected.size > 0;

  useEffect(() => {
    listGroceries(db).then(setGroceries);
  }, [db]);

  // Android back leaves selection mode instead of leaving the screen.
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelected(new Set());
        return true;
      });
      return () => sub.remove();
    }, [selecting]),
  );

  // Each change updates the screen immediately and is written to the database alongside.
  function patch(id: number, fields: Partial<Grocery>) {
    setGroceries((list) => list.map((g) => (g.id === id ? { ...g, ...fields } : g)));
  }

  async function add() {
    const item = newItem.trim();
    if (!item) return;
    setNewItem('');
    const grocery = await addGrocery(db, item);
    setGroceries((list) => [...list, grocery]);
  }

  function setQuantity(id: number, quantity: number) {
    patch(id, { quantity });
    setGroceryQuantity(db, id, quantity);
  }

  function rename(id: number, item: string) {
    patch(id, { item });
    renameGrocery(db, id, item);
  }

  function reorder({ from, to }: ReorderableListReorderEvent) {
    const next = reorderItems(groceries, from, to);
    setGroceries(next);
    saveOrder(
      db,
      'groceries',
      next.map((g) => g.id),
    );
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function confirmDelete() {
    const count = selected.size;
    Alert.alert(`Delete ${count} ${count === 1 ? 'item' : 'items'}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const ids = [...selected];
          setGroceries((list) => list.filter((g) => !selected.has(g.id)));
          setSelected(new Set());
          deleteGroceries(db, ids);
        },
      },
    ]);
  }

  return (
    <Screen
      title={selecting ? `${selected.size} selected` : 'Groceries'}
      actions={
        selecting && (
          <>
            <IconButton
              icon="close"
              label="Cancel selection"
              onPress={() => setSelected(new Set())}
            />
            <IconButton
              icon="delete"
              label="Delete selected items"
              color={theme.danger}
              onPress={confirmDelete}
            />
          </>
        )
      }>
      {/* While selecting, a hint takes the add bar's place at the same height, so the list doesn't
          jump out from under the finger that just long-pressed. */}
      {/* Distinct keys so each is a fresh native view: reusing one across the swap made Android
          drop the add bar's rounded corners. */}
      {selecting ? (
        <View key="hint" style={styles.addBar}>
          <ThemedText themeColor="textSecondary">Tap items to select them</ThemedText>
        </View>
      ) : (
        <View key="add" style={[styles.addBar, { backgroundColor: theme.backgroundElement }]}>
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={add}
            // Keep the keyboard up so several items can be added in a row.
            submitBehavior="submit"
            returnKeyType="done"
            placeholder="Add an item…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.addInput, { color: theme.text }]}
          />
          <IconButton icon="add" label="Add item" onPress={add} />
        </View>
      )}
      <ReorderableList
        data={groceries}
        onReorder={reorder}
        dragEnabled={!selecting}
        // Defaults autoscroll at ~150dp/s on Android, far slower than a drag. 5x measured ~520dp/s (a
        // brisk drag), and a larger edge zone starts it before the finger runs out of screen.
        autoscrollSpeedScale={AUTOSCROLL_SPEED_SCALE}
        autoscrollThreshold={0.15}
        keyExtractor={(g) => String(g.id)}
        keyboardShouldPersistTaps="handled"
        // Rows re-render when selection changes, not only when the data does.
        extraData={selected}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Nothing on the list. Add an item above.
          </ThemedText>
        }
        // Handlers are passed as-is (they take the id), so a row's props only change when its own
        // data or the selection does, and GroceryRow's memo can skip the rest on every reorder.
        renderItem={({ item }) => (
          <GroceryRow
            grocery={item}
            selecting={selecting}
            selected={selected.has(item.id)}
            onToggleSelected={toggleSelected}
            onQuantity={setQuantity}
            onRename={rename}
          />
        )}
      />
    </Screen>
  );
}

type RowProps = {
  grocery: Grocery;
  selecting: boolean;
  selected: boolean;
  onToggleSelected: (id: number) => void;
  onQuantity: (id: number, quantity: number) => void;
  onRename: (id: number, item: string) => void;
};

/**
 * One item. Still needed (quantity > 0): colored background. Got it (quantity 0): gray, struck
 * through. The check button sets the quantity to 0, or back to 1 if it's already 0. Tap the name
 * to rename it, drag the handle to reorder, and long press anywhere to start selecting items to
 * delete. While selecting, a tap toggles the item and the editing controls are hidden.
 */
const GroceryRow = memo(function GroceryRow({
  grocery,
  selecting,
  selected,
  onToggleSelected,
  onQuantity,
  onRename,
}: RowProps) {
  const theme = useTheme();
  const toggle = () => onToggleSelected(grocery.id);
  const setQuantity = (quantity: number) => onQuantity(grocery.id, quantity);
  const drag = useReorderableDrag();
  const [editingName, setEditingName] = useState(false);
  const done = grocery.quantity === 0;
  const nameStyle = [styles.name, { color: done ? theme.textSecondary : theme.text }, done && styles.struck];

  function commitName(text: string) {
    setEditingName(false);
    const trimmed = text.trim();
    // An item can't be blank; leaving it empty keeps the old name.
    if (trimmed && trimmed !== grocery.item) onRename(grocery.id, trimmed);
  }

  return (
    <Pressable
      onPress={selecting ? toggle : undefined}
      // Keep onLongPress set in both modes: Pressable only skips the tap on release if it still has a
      // long-press handler then, and the long press that starts selecting has re-rendered this row.
      onLongPress={toggle}
      accessibilityState={selecting ? { selected } : undefined}
      style={[
        styles.row,
        {
          backgroundColor: done ? theme.backgroundElement : theme.accentBackground,
          borderColor: selected ? theme.accent : 'transparent',
        },
      ]}>
      {selecting ? (
        <View style={styles.selectMark}>
          <MaterialIcons
            name={
              selected
                ? 'check-box'
                : 'check-box-outline-blank'
            }
            size={26}
            color={selected ? theme.accent : theme.textSecondary}
          />
        </View>
      ) : (
        <IconButton
          icon={
            done
              ? 'check-circle'
              : 'radio-button-unchecked'
          }
          label={done ? `Need ${grocery.item} again` : `Got ${grocery.item}`}
          color={done ? theme.textSecondary : theme.accent}
          onPress={() => setQuantity(done ? 1 : 0)}
        />
      )}
      {editingName && !selecting ? (
        <TextInput
          defaultValue={grocery.item}
          onEndEditing={(e) => commitName(e.nativeEvent.text)}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          style={nameStyle}
        />
      ) : (
        <Pressable
          style={styles.nameButton}
          onPress={selecting ? toggle : () => setEditingName(true)}
          onLongPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={selecting ? `Select ${grocery.item}` : `Rename ${grocery.item}`}>
          <ThemedText style={nameStyle} numberOfLines={1}>
            {grocery.item}
          </ThemedText>
        </Pressable>
      )}
      {selecting ? (
        // Show the quantity read-only so it's clear what's being deleted.
        <ThemedText style={styles.quantity} themeColor="textSecondary">
          ×{grocery.quantity}
        </ThemedText>
      ) : (
        <>
          <View style={styles.stepper}>
            <IconButton
              icon="remove"
              label={`Fewer ${grocery.item}`}
              color={done ? theme.textSecondary : theme.text}
              onPress={() => setQuantity(Math.max(0, grocery.quantity - 1))}
            />
            <ThemedText
              style={styles.quantity}
              themeColor={done ? 'textSecondary' : 'text'}
              accessibilityLabel={`Quantity ${grocery.quantity}`}>
              {grocery.quantity}
            </ThemedText>
            <IconButton
              icon="add"
              label={`More ${grocery.item}`}
              onPress={() => setQuantity(grocery.quantity + 1)}
            />
          </View>
          <Pressable
            // Start dragging as soon as the handle is touched; no long press needed.
            onPressIn={drag}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${grocery.item}`}
            style={styles.handle}>
            <MaterialIcons
            name={'drag-indicator'}
              size={22}
              color={theme.textSecondary}
            />
          </Pressable>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  addBar: {
    // Fixed so the selection hint that replaces it takes exactly the same space.
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
  },
  addInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontSize: 16,
  },
  row: {
    // Spacing is a margin on each row, not `gap` on the list: the reorder library measures rows to
    // slide them aside during a drag, and a list-level gap isn't part of that measurement, so rows
    // landed 8dp off and visibly jumped once the drop re-rendered.
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
    // Always 2px so selecting an item doesn't shift its layout, only recolors the border.
    borderWidth: 2,
  },
  selectMark: {
    padding: Spacing.one,
  },
  name: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: Spacing.two,
  },
  nameButton: {
    flex: 1,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handle: {
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.one,
  },
  quantity: {
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
