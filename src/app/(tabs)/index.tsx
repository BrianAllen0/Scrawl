import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type FlatList } from 'react-native';
import Animated, { Easing, Keyframe, useAnimatedScrollHandler } from 'react-native-reanimated';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton } from '@/components/icon-button';
import { MarkdownText } from '@/components/markdown-text';
import { Screen } from '@/components/screen';
import { SelectionActions } from '@/components/selection-actions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { REORDER_AUTOSCROLL } from '@/constants/reorder';
import { Spacing } from '@/constants/theme';
import { useSelection } from '@/hooks/use-selection';
import { useTheme } from '@/hooks/use-theme';
import { saveOrder } from '@/lib/db';
import { createNote, deleteEmptyNotes, deleteNotes, listNotes, type Note } from '@/lib/notes';

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
 *
 * Rows also have a drag handle to reorder (dropping a note into the card makes it the first note)
 * and a long press to select notes for deletion, as on the other tabs.
 */
export default function NotesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [first, setFirst] = useState({ index: 0, direction: 1 });
  const [listHeight, setListHeight] = useState(0);

  const { selected, selecting, toggle: toggleSelected, clear: clearSelection } = useSelection();

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

  function onScroll(y: number) {
    offset.current = y;
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

  function onScrollEndDrag(velocity: number) {
    dragging.current = false;
    if (anchorInCard()) {
      // Dropped inside the card: settle the carried note into first position.
      scrollToIndex(anchor.current!);
      return;
    }
    anchor.current = null;
    // A slow release snaps now; a fling coasts first and snaps in onMomentumScrollEnd.
    if (Math.abs(velocity) < FLING_VELOCITY) scrollToIndex(nearestIndex());
  }

  function onMomentumScrollEnd() {
    if (anchor.current !== null) return; // still gliding a dropped note into place
    if (Math.abs(offset.current - nearestIndex() * ROW_STRIDE) >= 1) scrollToIndex(nearestIndex());
  }

  // The reorder list only takes a Reanimated scroll handler, which runs on the UI thread; hop back to
  // JS for the card logic. Deps: the callbacks read notes.length (via nearestIndex).
  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (e) => scheduleOnRN(onScroll, e.contentOffset.y),
      onBeginDrag: () => scheduleOnRN(onScrollBeginDrag),
      onEndDrag: (e) => scheduleOnRN(onScrollEndDrag, e.velocity?.y ?? 0),
      onMomentumEnd: () => scheduleOnRN(onMomentumScrollEnd),
    },
    [notes.length],
  );

  function onScrollBeginDrag() {
    dragging.current = true;
  }

  const open = useCallback((id: number) => router.push(`/note/${id}`), []);
  const touchRow = useCallback((index: number) => (touchedRow.current = index), []);

  function reorder({ from, to }: ReorderableListReorderEvent) {
    const next = reorderItems(notes, from, to);
    setNotes(next);
    saveOrder(
      db,
      'notes',
      next.map((n) => n.id),
    );
    // Autoscroll during the drag can leave the list between notes; settle on the nearest one.
    scrollToIndex(nearestIndex());
  }

  function deleteSelected() {
    setNotes((list) => list.filter((n) => !selected.has(n.id)));
    deleteNotes(db, [...selected]);
    clearSelection();
  }

  async function addNote() {
    const id = await createNote(db);
    router.push(`/note/${id}`);
  }

  // Clamp in case notes were deleted while the list was scrolled down.
  const firstNote = notes[Math.min(first.index, notes.length - 1)];
  const scrollingDown = first.direction > 0;
  const firstSelected = !!firstNote && selected.has(firstNote.id);

  return (
    <Screen
      title={selecting ? `${selected.size} selected` : 'Notes'}
      actions={
        selecting ? (
          <SelectionActions
            count={selected.size}
            noun={['note', 'notes']}
            onCancel={clearSelection}
            onDelete={deleteSelected}
          />
        ) : (
          <IconButton icon="add" label="New note" onPress={addNote} />
        )
      }>
      <View
        style={styles.listArea}
        // Touch events bubble, so the touched row has recorded itself by the time this runs. A touch
        // that misses every row (the card, or the empty space below the list) anchors nothing.
        onTouchStart={() => {
          anchor.current = touchedRow.current;
          touchedRow.current = null;
        }}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
        <ReorderableList
          ref={listRef}
          data={notes}
          keyExtractor={(note) => String(note.id)}
          onReorder={reorder}
          dragEnabled={!selecting}
          {...REORDER_AUTOSCROLL}
          // The top autoscroll zone starts below the card, which covers the top of the list.
          autoscrollThresholdOffset={{ start: CARD_HEIGHT }}
          onScroll={scrollHandler}
          decelerationRate="fast"
          contentContainerStyle={{
            // The first-position row sits hidden behind the card; the next row starts just below it.
            paddingTop: PREVIEW_HEIGHT,
            // Enough room at the end for the last note to scroll up into first position.
            paddingBottom: Math.max(0, listHeight - PREVIEW_HEIGHT - ROW_STRIDE),
          }}
          // Rows re-render when selection changes, not only when the data does.
          extraData={selected}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No notes yet. Tap + to write one.
            </ThemedText>
          }
          // Handlers take the id or index, so a row's props only change with its own data or the
          // selection, and NoteRow's memo skips the rest on every reorder.
          renderItem={({ item, index }) => (
            <NoteRow
              note={item}
              index={index}
              selecting={selecting}
              selected={selected.has(item.id)}
              onOpen={open}
              onToggleSelected={toggleSelected}
              onTouch={touchRow}
            />
          )}
        />

        {firstNote && (
          <Pressable
            style={styles.cardPosition}
            // The card covers the first note's row, so it stands in for it: open, or select.
            onPress={selecting ? () => toggleSelected(firstNote.id) : () => open(firstNote.id)}
            onLongPress={() => toggleSelected(firstNote.id)}
            accessibilityRole="button"
            accessibilityState={selecting ? { selected: firstSelected } : undefined}
            accessibilityLabel={`Open ${firstNote.title || 'Untitled'}`}>
            <ThemedView
              type="backgroundSelected"
              style={[styles.card, { borderColor: firstSelected ? theme.accent : 'transparent' }]}>
              {/* Keyed by note so a change of first note runs the exit/enter animations. */}
              <Animated.View
                key={firstNote.id}
                style={styles.cardContent}
                entering={scrollingDown ? ENTER_FROM_BELOW : ENTER_FROM_ABOVE}
                exiting={scrollingDown ? EXIT_UPWARD : EXIT_DOWNWARD}>
                <View style={styles.cardTitleRow}>
                  {selecting && <SelectMark selected={firstSelected} />}
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                    {firstNote.title || 'Untitled'}
                  </ThemedText>
                </View>
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

function SelectMark({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <MaterialIcons
      name={selected ? 'check-box' : 'check-box-outline-blank'}
      size={24}
      color={selected ? theme.accent : theme.textSecondary}
    />
  );
}

type RowProps = {
  note: Note;
  index: number;
  selecting: boolean;
  selected: boolean;
  onOpen: (id: number) => void;
  onToggleSelected: (id: number) => void;
  onTouch: (index: number) => void;
};

/** A note's title row. Tap to open, drag the handle to reorder, long press to start selecting. */
const NoteRow = memo(function NoteRow({
  note,
  index,
  selecting,
  selected,
  onOpen,
  onToggleSelected,
  onTouch,
}: RowProps) {
  const theme = useTheme();
  const drag = useReorderableDrag();
  const toggle = () => onToggleSelected(note.id);
  return (
    <Pressable
      onPress={selecting ? toggle : () => onOpen(note.id)}
      // Keep onLongPress set in both modes: Pressable only skips the tap on release if it still has a
      // long-press handler then, and the long press that starts selecting has re-rendered this row.
      onLongPress={toggle}
      // Records which note the finger is on, for the card's drag-into-the-card behavior.
      onTouchStart={() => onTouch(index)}
      accessibilityState={selecting ? { selected } : undefined}
      accessibilityLabel={note.title || 'Untitled'}>
      <ThemedView
        type="backgroundElement"
        style={[styles.row, { borderColor: selected ? theme.accent : 'transparent' }]}>
        {selecting && <SelectMark selected={selected} />}
        <ThemedText numberOfLines={1} style={styles.rowTitle}>
          {note.title || 'Untitled'}
        </ThemedText>
        {!selecting && (
          <Pressable
            // Start dragging as soon as the handle is touched; no long press needed.
            onPressIn={drag}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${note.title || 'Untitled'}`}>
            <MaterialIcons name="drag-indicator" size={22} color={theme.textSecondary} />
          </Pressable>
        )}
      </ThemedView>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  listArea: {
    flex: 1,
  },
  row: {
    height: ROW_HEIGHT,
    // Spacing is a margin on each row, not `gap` on the list: the reorder library measures rows.
    marginBottom: ROW_GAP,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    // Always 2px so selecting a note doesn't shift its layout, only recolors the border.
    borderWidth: 2,
  },
  rowTitle: {
    flex: 1,
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
    borderWidth: 2,
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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: {
    flex: 1,
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
