export const qk = {
  items: ['items'] as const,
  workBlocks: ['workBlocks'] as const,
  workBlocksRange: (startIso: string, endIso: string) => ['workBlocks', 'range', startIso, endIso] as const,
  workBlocksItem: (itemId: string) => ['workBlocks', 'item', itemId] as const,
  workspace: ['workspace'] as const,
};
