-- name: CreateItem :one
INSERT INTO items (user_id, title, description, open_at, deadline_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetItem :one
SELECT i.*, (SELECT count(*) FROM work_blocks w WHERE w.item_id = i.id)::int AS work_block_count,
       (SELECT COALESCE(sum(EXTRACT(EPOCH FROM w.end_at - w.start_at)), 0) / 60 FROM work_blocks w WHERE w.item_id = i.id)::int AS scheduled_minutes
FROM items i
WHERE i.id = $1 AND i.user_id = $2;

-- name: ListItems :many
SELECT i.*, (SELECT count(*) FROM work_blocks w WHERE w.item_id = i.id)::int AS work_block_count,
       (SELECT COALESCE(sum(EXTRACT(EPOCH FROM w.end_at - w.start_at)), 0) / 60 FROM work_blocks w WHERE w.item_id = i.id)::int AS scheduled_minutes
FROM items i
WHERE i.user_id = @user_id
  AND (sqlc.narg('status')::text IS NULL OR i.status = sqlc.narg('status')::text)
  AND (sqlc.narg('scheduled')::bool IS NULL
       OR EXISTS (SELECT 1 FROM work_blocks w WHERE w.item_id = i.id) = sqlc.narg('scheduled')::bool)
ORDER BY i.created_at DESC, i.id;

-- name: LockItem :one
SELECT * FROM items WHERE id = $1 AND user_id = $2 FOR UPDATE;

-- name: UpdateItem :one
UPDATE items
SET title = $3, description = $4, open_at = $5, deadline_at = $6,
    status = $7, completed_at = $8, updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ItemBlockStats :one
SELECT count(*)::int AS work_block_count,
       (COALESCE(sum(EXTRACT(EPOCH FROM end_at - start_at)), 0) / 60)::int AS scheduled_minutes
FROM work_blocks WHERE item_id = $1;

-- name: DeleteItem :execrows
DELETE FROM items WHERE id = $1 AND user_id = $2;

-- name: ItemExists :one
SELECT EXISTS (SELECT 1 FROM items WHERE id = $1 AND user_id = $2);
