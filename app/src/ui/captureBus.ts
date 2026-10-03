/** Lets "+ Item" and the N shortcut focus the most recently mounted Dropbox capture input. */
const stack: (() => void)[] = [];

export function registerCapture(focus: () => void): () => void {
  stack.push(focus);
  return () => {
    const i = stack.lastIndexOf(focus);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function focusCapture(): void {
  stack.at(-1)?.();
}
