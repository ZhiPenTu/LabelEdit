export function acceptsEditorShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('form, input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"], [data-editor-shortcuts="off"]')) return false;
  // Portalled menus/dialogs can move focus while the event is bubbling.
  return !document.querySelector('[role="dialog"][data-open], [role="dialog"][data-state="open"], [role="menu"][data-open], [role="listbox"][data-open]');
}
