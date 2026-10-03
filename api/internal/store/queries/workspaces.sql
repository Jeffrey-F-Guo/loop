-- name: GetWorkspace :one
SELECT layout, updated_at FROM workspaces WHERE user_id = $1;

-- name: InsertWorkspaceIfMissing :exec
INSERT INTO workspaces (user_id, layout) VALUES ($1, $2)
ON CONFLICT (user_id) DO NOTHING;

-- name: UpsertWorkspace :one
INSERT INTO workspaces (user_id, layout) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()
RETURNING layout, updated_at;
