import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteGroceries, getGrocery, renameGrocery, setGroceryQuantity } from '@/lib/groceries';

export default function GroceryEditorScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const [grocery, setGrocery] = useState<{ item: string; quantity: number } | null>(null);

  useEffect(() => {
    getGrocery(db, id).then((found) => {
      if (!found) return router.back();
      setGrocery(found);
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
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <TextInput
            value={grocery.item}
            onChangeText={rename}
            onEndEditing={(e) => rename(e.nativeEvent.text.trim())}
            placeholder="What do you need?"
            placeholderTextColor={theme.textSecondary}
            style={[styles.name, { color: theme.text }]}
            autoFocus={!grocery.item}
            returnKeyType="done"
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
        </ScrollView>
      </KeyboardAvoidingView>
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
  quantity: {
    minWidth: 32,
    fontSize: 18,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
