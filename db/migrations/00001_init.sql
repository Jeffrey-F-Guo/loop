-- +goose Up
CREATE TABLE items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description  TEXT NULL,
  open_at      TIMESTAMPTZ NULL,
  deadline_at  TIMESTAMPTZ NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  CHECK (open_at IS NULL OR deadline_at IS NULL OR open_at <= deadline_at)
);
CREATE INDEX items_user_idx          ON items (user_id);
CREATE INDEX items_user_status_idx   ON items (user_id, status);
CREATE INDEX items_user_deadline_idx ON items (user_id, deadline_at);

CREATE TABLE work_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at - start_at >= interval '15 minutes')
);
CREATE INDEX work_blocks_user_start_idx ON work_blocks (user_id, start_at);
CREATE INDEX work_blocks_item_idx       ON work_blocks (item_id);

CREATE TABLE workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE,
  layout     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE workspaces;
DROP TABLE work_blocks;
DROP TABLE items;
