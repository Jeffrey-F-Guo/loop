// Wire types for /api/v1. Frozen after Task 3; see api-contract/openapi.yaml.

export type ItemStatus = 'active' | 'completed';

export interface Item {
  id: string;
  title: string;
  description: string | null;
  open_at: string | null;
  deadline_at: string | null;
  status: ItemStatus;
  work_block_count: number;
  /** Total length of the item's work blocks. */
  scheduled_minutes: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateItemInput {
  title: string;
  description?: string | null;
  open_at?: string | null;
  deadline_at?: string | null;
}

export type UpdateItemInput = Partial<{
  title: string;
  description: string | null;
  open_at: string | null;
  deadline_at: string | null;
  status: ItemStatus;
  /** Move open_at, deadline_at and all of the item's work blocks by whole days in time_zone. */
  shift_days: number;
  /** IANA zone; required with shift_days. */
  time_zone: string;
}>;

export interface WorkBlock {
  id: string;
  item_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkBlockInput {
  item_id: string;
  start_at: string;
  end_at: string;
}

export type UpdateWorkBlockInput = Partial<{ start_at: string; end_at: string }>;

/** Pre-sections Dropbox config value; only read when upgrading a stored workspace. */
export type DropboxFilter = 'all' | 'scheduled' | 'unscheduled' | 'completed';
export type DropboxSection = 'scheduled' | 'unscheduled' | 'completed';
export type CalendarMode = 'week' | 'day';

export type ViewInstance =
  | { type: 'dropbox'; config: { sections: DropboxSection[] } }
  | { type: 'timeline'; config: Record<string, never> }
  | { type: 'calendar'; config: { mode: CalendarMode } };

export type ViewType = ViewInstance['type'];

export interface SplitNode {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  children: LayoutNode[];
  sizes: number[];
}

export interface ViewNode {
  kind: 'view';
  id: string;
  view: ViewInstance;
}

export type LayoutNode = SplitNode | ViewNode;

export interface Layout {
  version: 1;
  root: LayoutNode | null;
}

export interface WorkspaceResponse {
  layout: Layout;
  updated_at: string;
}

export type ApiErrorCode = 'validation_failed' | 'unauthorized' | 'not_found' | 'internal';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; field?: string };
}

export interface ItemsResponse {
  items: Item[];
}

export interface WorkBlocksResponse {
  work_blocks: WorkBlock[];
}
