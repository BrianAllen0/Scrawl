import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createGrocery, deleteGroceries, getGrocery, renameGrocery, setGroceryQuantity } from '@/lib/groceries';

export default function GroceryEditorScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const [grocery, setGrocery] = useState<{ item: string; quantity: number } | null>(null);
  // Opened blank, i.e. just created from the + button. Only then is "Add another" offered.
  const [isNew, setIsNew] = useState(false);
  const nameInput = useRef<TextInput>(null);

  useEffect(() => {
    getGrocery(db, id).then((found) => {
      if (!found) return router.back();
      setGrocery(found);
      setIsNew(!found.item);
    });
  }, [db, id]);

  // Autosave: every edit is written straight to the database.
  function rename(item: string) {
    setGrocery((g) => g && { ...g, item });
    renameGrocery(db, id, item);
  }

  function setQuantity(quantity: number) {
    setGrocery((g) => g && { ...g, quantity });
    setGroceryQuantity(db, id, quantity);
  }

  // Save this item and switch this screen to a fresh one, so the keyboard stays up for the next entry.
  // Takes the name as an argument: reading `grocery` in here would make the React Compiler read
  // `grocery.item` during render, before the null check below.
  async function addAnother(item: string) {
    rename(item.trim());
    const next = await createGrocery(db);
    router.setParams({ id: String(next) });
    nameInput.current?.focus();
  }

  function confirmDelete() {
    Alert.alert('Delete item?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGroceries(db, [id]);
          router.back();
        },
      },
    ]);
  }

  if (!grocery) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="delete" label="Delete item" onPress={confirmDelete} />,
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        bottomOffset={Spacing.three}>
        <TextInput
          ref={nameInput}
          value={grocery.item}
          onChangeText={rename}
          onEndEditing={(e) => rename(e.nativeEvent.text.trim())}
          placeholder="What do you need?"
          placeholderTextColor={theme.textSecondary}
          style={[styles.name, { color: theme.text }]}
          autoFocus={!grocery.item}
          // On a new item, the return key adds another and keeps the keyboard up. A blank name just closes it.
          returnKeyType={isNew ? 'next' : 'done'}
          submitBehavior={isNew ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={(e) =>
            isNew && e.nativeEvent.text.trim() ? addAnother(e.nativeEvent.text) : nameInput.current?.blur()
          }
        />

        <ThemedText type="smallBold" themeColor="textSecondary">
          Quantity
        </ThemedText>
        <View style={[styles.stepper, { backgroundColor: theme.backgroundElement }]}>
          <IconButton
            icon="remove"
            label="Decrease quantity"
            onPress={() => setQuantity(Math.max(0, grocery.quantity - 1))}
          />
          <ThemedText style={styles.quantity} accessibilityLabel={`Quantity ${grocery.quantity}`}>
            {grocery.quantity}
          </ThemedText>
          <IconButton icon="add" label="Increase quantity" onPress={() => setQuantity(grocery.quantity + 1)} />
        </View>

        {isNew && (
          <Pressable
            onPress={() => addAnother(grocery.item)}
            disabled={!grocery.item.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: !grocery.item.trim() }}
            style={({ pressed }) => [
              styles.addAnother,
              { backgroundColor: theme.accentBackground },
              (pressed || !grocery.item.trim()) && styles.dimmed,
            ]}>
            <MaterialIcons name="add" size={22} color={theme.accent} />
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Add another
            </ThemedText>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  name: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
    marginBottom: Spacing.two,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  addAnother: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  dimmed: {
    opacity: 0.5,
  },
  quantity: {
    minWidth: 32,
    fontSize: 18,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
