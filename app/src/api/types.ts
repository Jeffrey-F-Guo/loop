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

export type DropboxFilter = 'all' | 'scheduled' | 'unscheduled' | 'completed';
export type CalendarMode = 'week' | 'day';

export type ViewInstance =
  | { type: 'dropbox'; config: { filter: DropboxFilter } }
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
