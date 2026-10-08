import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import { IconButton } from '@/components/icon-button';
import { MarkdownText } from '@/components/markdown-text';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createNote, deleteEmptyNotes, listNotes, type Note } from '@/lib/notes';

// Every row has a fixed height so the scroll offset maps straight to the note in first position.
const ROW_HEIGHT = 56;
const ROW_GAP = Spacing.two;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
const PREVIEW_HEIGHT = 150;
const CARD_HEIGHT = ROW_HEIGHT + PREVIEW_HEIGHT;
const ANIMATION_MS = 260;
// Releasing faster than this (Android reports px/ms) counts as a fling: let it coast, then snap.
const FLING_VELOCITY = 0.3;

// The card's content rolls like a carousel: the outgoing note slides out one edge while the
// incoming one slides in from the other, matching the direction the list is moving.
function roll(from: number, to: number) {
  return new Keyframe({
    0: { transform: [{ translateY: from }] },
    100: { transform: [{ translateY: to }], easing: Easing.out(Easing.cubic) },
  }).duration(ANIMATION_MS);
}
const ENTER_FROM_BELOW = roll(CARD_HEIGHT, 0);
const ENTER_FROM_ABOVE = roll(-CARD_HEIGHT, 0);
const EXIT_UPWARD = roll(0, -CARD_HEIGHT);
const EXIT_DOWNWARD = roll(0, CARD_HEIGHT);

/**
 * The note in first position is shown as a card pinned to the top of the list: its title plus a
 * rendered preview of its body. The list scrolls up underneath the card, and whenever another note
 * reaches first position the card's content slides over to it, in the direction of the scroll.
 *
 * Dragging a particular note up into the card shows that note as soon as any of it enters the card,
 * and letting go there settles it into first position. Without that, the card would follow scroll
 * distance alone, and since the card is ~3 rows tall the notes behind the dragged one would take
 * over before it got far into the card.
 */
export default function NotesScreen() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [first, setFirst] = useState({ index: 0, direction: 1 });
  const [listHeight, setListHeight] = useState(0);

  const listRef = useRef<FlatList<Note>>(null);
  const offset = useRef(0);
  // The note the finger is carrying. Set on touch, kept while dragging and while the list glides it
  // into first position after release; null otherwise.
  const anchor = useRef<number | null>(null);
  const touchedRow = useRef<number | null>(null);
  const dragging = useRef(false);

  // Reload whenever the tab regains focus, e.g. coming back from the editor. No editor is open
  // at that point, so it's also the safe moment to drop notes that were created but left blank.
  useFocusEffect(
    useCallback(() => {
      deleteEmptyNotes(db).then(() => listNotes(db).then(setNotes));
    }, [db]),
  );

  function show(index: number) {
    setFirst((prev) => (prev.index === index ? prev : { index, direction: index > prev.index ? 1 : -1 }));
  }

  function nearestIndex() {
    return Math.min(Math.max(0, Math.round(offset.current / ROW_STRIDE)), Math.max(0, notes.length - 1));
  }

  function scrollToIndex(index: number) {
    listRef.current?.scrollToOffset({ offset: index * ROW_STRIDE, animated: true });
  }

  /** Whether any part of the anchored note's row is inside the card right now. */
  function anchorInCard() {
    if (anchor.current === null) return false;
    const rowTop = PREVIEW_HEIGHT + anchor.current * ROW_STRIDE - offset.current;
    return rowTop < CARD_HEIGHT && rowTop + ROW_HEIGHT > 0;
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    offset.current = event.nativeEvent.contentOffset.y;
    if (anchorInCard()) {
      show(anchor.current!);
      // Once the post-release glide has landed, hand back to the scroll-position rule.
      if (!dragging.current && Math.abs(offset.current - anchor.current! * ROW_STRIDE) < 1) {
        anchor.current = null;
      }
    } else {
      show(nearestIndex());
    }
  }

  function onScrollEndDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    dragging.current = false;
    if (anchorInCard()) {
      // Dropped inside the card: settle the carried note into first position.
      scrollToIndex(anchor.current!);
      return;
    }
    anchor.current = null;
    // A slow release snaps now; a fling coasts first and snaps in onMomentumScrollEnd.
    if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < FLING_VELOCITY) scrollToIndex(nearestIndex());
  }

  function onMomentumScrollEnd() {
    if (anchor.current !== null) return; // still gliding a dropped note into place
    if (Math.abs(offset.current - nearestIndex() * ROW_STRIDE) >= 1) scrollToIndex(nearestIndex());
  }

  async function addNote() {
    const id = await createNote(db);
    router.push(`/note/${id}`);
  }

  // Clamp in case notes were deleted while the list was scrolled down.
  const firstNote = notes[Math.min(first.index, notes.length - 1)];
  const scrollingDown = first.direction > 0;

  return (
    <Screen
      title="Notes"
      actions={<IconButton icon={{ ios: 'plus', android: 'add' }} label="New note" onPress={addNote} />}>
      <View
        style={styles.listArea}
        // Touch events bubble, so the touched row has recorded itself by the time this runs. A touch
        // that misses every row (the card, or the empty space below the list) anchors nothing.
        onTouchStart={() => {
          anchor.current = touchedRow.current;
          touchedRow.current = null;
        }}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
        <FlatList
          ref={listRef}
          data={notes}
          keyExtractor={(note) => String(note.id)}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => (dragging.current = true)}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
          decelerationRate="fast"
          contentContainerStyle={{
            // The first-position row sits hidden behind the card; the next row starts just below it.
            paddingTop: PREVIEW_HEIGHT,
            // Enough room at the end for the last note to scroll up into first position.
            paddingBottom: Math.max(0, listHeight - PREVIEW_HEIGHT - ROW_STRIDE),
          }}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No notes yet. Tap + to write one.
            </ThemedText>
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push(`/note/${item.id}`)}
              onTouchStart={() => (touchedRow.current = index)}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText numberOfLines={1}>{item.title || 'Untitled'}</ThemedText>
              </ThemedView>
            </Pressable>
          )}
        />

        {firstNote && (
          <Pressable
            style={styles.cardPosition}
            onPress={() => router.push(`/note/${firstNote.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${firstNote.title || 'Untitled'}`}>
            <ThemedView type="backgroundSelected" style={styles.card}>
              {/* Keyed by note so a change of first note runs the exit/enter animations. */}
              <Animated.View
                key={firstNote.id}
                style={styles.cardContent}
                entering={scrollingDown ? ENTER_FROM_BELOW : ENTER_FROM_ABOVE}
                exiting={scrollingDown ? EXIT_UPWARD : EXIT_DOWNWARD}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                  {firstNote.title || 'Untitled'}
                </ThemedText>
                <View style={styles.preview}>
                  {firstNote.body ? (
                    <MarkdownText value={firstNote.body} selectable={false} />
                  ) : (
                    <ThemedText themeColor="textSecondary">Empty note</ThemedText>
                  )}
                </View>
              </Animated.View>
            </ThemedView>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listArea: {
    flex: 1,
  },
  row: {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: Spacing.three,
  },
  cardPosition: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardContent: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: Spacing.three,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: ROW_HEIGHT,
  },
  preview: {
    flex: 1,
    overflow: 'hidden',
    paddingBottom: Spacing.three,
  },
  empty: {
    textAlign: 'center',
  },
});
