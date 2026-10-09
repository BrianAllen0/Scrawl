import type { Todo } from './todos';

/**
 * The todos screen is one reorderable list whose rows are category headers, open todos, and a
 * final "Completed" section. These pure helpers build those rows and turn a drag-and-drop on them
 * back into todos to save.
 */

export const UNCATEGORIZED = '';

export type Row =
  | { type: 'header'; category: string; count: number; collapsed: boolean }
  | { type: 'completed-header'; count: number; collapsed: boolean }
  | { type: 'todo'; todo: Todo };

const isOpen = (t: Todo) => t.completed_at === null;

/** Open todos by category: categories A–Z, uncategorized last, saved order within each. */
export function groupByCategory(todos: Todo[]): [category: string, todos: Todo[]][] {
  const groups = new Map<string, Todo[]>();
  for (const todo of todos.filter(isOpen)) groups.set(todo.category, [...(groups.get(todo.category) ?? []), todo]);
  return [...groups.entries()].sort(([a], [b]) =>
    a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b),
  );
}

/** Completed todos, most recently completed first. */
export function completedTodos(todos: Todo[]) {
  return todos.filter((t) => !isOpen(t)).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));
}

/**
 * Every todo in the order to save: open ones as displayed (grouped by category), then completed
 * ones in their existing order, so a todo that's reopened returns to its old place.
 */
export function saveOrderOf(todos: Todo[]) {
  return [...groupByCategory(todos).flatMap(([, list]) => list), ...todos.filter((t) => !isOpen(t))];
}

/**
 * One header per category followed by its open todos (unless collapsed), then a Completed section
 * if anything is done.
 */
export function buildRows(todos: Todo[], collapsed: ReadonlySet<string>, completedCollapsed: boolean): Row[] {
  const rows = groupByCategory(todos).flatMap(([category, list]): Row[] => {
    const isCollapsed = collapsed.has(category);
    const header: Row = { type: 'header', category, count: list.length, collapsed: isCollapsed };
    return isCollapsed ? [header] : [header, ...list.map((todo): Row => ({ type: 'todo', todo }))];
  });
  const done = completedTodos(todos);
  if (done.length > 0) {
    rows.push({ type: 'completed-header', count: done.length, collapsed: completedCollapsed });
    if (!completedCollapsed) rows.push(...done.map((todo): Row => ({ type: 'todo', todo })));
  }
  return rows;
}

/**
 * Applies a drop of the (open) todo row at `from` to index `to`. Each open todo takes the category
 * of the nearest header above it, so dropping a todo into another section moves it to that
 * category (a drop above the first header lands in the first section). A drop into the Completed
 * section doesn't complete the todo; it goes back to its own category. Todos that aren't rows
 * (collapsed sections) keep their place. Returns every todo in save order, plus the one whose
 * category changed, if any.
 */
export function applyDrop(rows: Row[], from: number, to: number, todos: Todo[]) {
  const moved = [...rows];
  const [row] = moved.splice(from, 1);
  moved.splice(to, 0, row);

  let category = moved.find((r) => r.type === 'header')?.category ?? UNCATEGORIZED;
  let inCompleted = false;
  const visible: Todo[] = [];
  let recategorized: Todo | null = null;
  for (const r of moved) {
    if (r.type === 'header') {
      category = r.category;
    } else if (r.type === 'completed-header') {
      inCompleted = true;
    } else if (isOpen(r.todo)) {
      const target = inCompleted ? r.todo.category : category;
      const todo = r.todo.category === target ? r.todo : { ...r.todo, category: target };
      if (todo !== r.todo) recategorized = todo;
      visible.push(todo);
    }
  }

  const visibleIds = new Set(visible.map((t) => t.id));
  const rest = todos.filter((t) => !visibleIds.has(t.id));
  // Regroup so a todo dropped above the first header sits under it, and hidden todos stay put.
  return { todos: saveOrderOf([...visible, ...rest]), recategorized };
}
