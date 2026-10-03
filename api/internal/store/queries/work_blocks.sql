-- name: CreateWorkBlock :one
INSERT INTO work_blocks (user_id, item_id, start_at, end_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetWorkBlock :one
SELECT * FROM work_blocks WHERE id = $1 AND user_id = $2;

-- name: LockWorkBlock :one
SELECT * FROM work_blocks WHERE id = $1 AND user_id = $2 FOR UPDATE;

-- name: ListWorkBlocks :many
SELECT * FROM work_blocks
WHERE user_id = @user_id
  AND (sqlc.narg('item_id')::uuid IS NULL OR item_id = sqlc.narg('item_id')::uuid)
  AND (sqlc.narg('range_start')::timestamptz IS NULL OR end_at > sqlc.narg('range_start')::timestamptz)
  AND (sqlc.narg('range_end')::timestamptz IS NULL OR start_at < sqlc.narg('range_end')::timestamptz)
ORDER BY start_at, id;

-- name: UpdateWorkBlock :one
UPDATE work_blocks
SET start_at = $3, end_at = $4, updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteWorkBlock :execrows
DELETE FROM work_blocks WHERE id = $1 AND user_id = $2;
