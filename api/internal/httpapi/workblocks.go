package httpapi

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

func (s *Server) registerWorkBlocks(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/work-blocks", s.createWorkBlock)
	mux.HandleFunc("GET /api/v1/work-blocks", s.listWorkBlocks)
	mux.HandleFunc("GET /api/v1/work-blocks/{id}", s.getWorkBlock)
	mux.HandleFunc("PATCH /api/v1/work-blocks/{id}", s.patchWorkBlock)
	mux.HandleFunc("DELETE /api/v1/work-blocks/{id}", s.deleteWorkBlock)
}

func (s *Server) createWorkBlock(w http.ResponseWriter, r *http.Request) {
	var in domain.NewWorkBlock
	if err := decodeJSON(w, r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	in, err := in.Validate()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.GetItem(r.Context(), userOf(r), in.ItemID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := domain.CheckBlockInItem(it, in.StartAt, in.EndAt); err != nil {
		s.fail(w, r, err)
		return
	}
	b, err := s.store.CreateWorkBlock(r.Context(), userOf(r), in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, b)
}

func parseBlockFilter(r *http.Request) (store.BlockFilter, error) {
	q := r.URL.Query()
	var f store.BlockFilter
	if v := q.Get("item_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return f, &domain.ValidationError{Field: "item_id", Message: "item_id must be a UUID"}
		}
		f.ItemID = &id
	}
	startS, endS := q.Get("start"), q.Get("end")
	if (startS == "") != (endS == "") {
		return f, &domain.ValidationError{Field: "start", Message: "start and end must be provided together"}
	}
	if startS != "" {
		start, err := time.Parse(time.RFC3339, startS)
		if err != nil {
			return f, &domain.ValidationError{Field: "start", Message: "start must be RFC 3339"}
		}
		end, err := time.Parse(time.RFC3339, endS)
		if err != nil {
			return f, &domain.ValidationError{Field: "end", Message: "end must be RFC 3339"}
		}
		if !end.After(start) {
			return f, &domain.ValidationError{Field: "end", Message: "end must be after start"}
		}
		f.Start, f.End = &start, &end
	}
	if f.ItemID == nil && f.Start == nil {
		return f, &domain.ValidationError{Field: "start", Message: "provide start and end, item_id, or both"}
	}
	return f, nil
}

func (s *Server) listWorkBlocks(w http.ResponseWriter, r *http.Request) {
	f, err := parseBlockFilter(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	blocks, err := s.store.ListWorkBlocks(r.Context(), userOf(r), f)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"work_blocks": blocks})
}

func (s *Server) getWorkBlock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	b, err := s.store.GetWorkBlock(r.Context(), userOf(r), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (s *Server) patchWorkBlock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var p domain.WorkBlockPatch
	if err := decodeJSON(w, r, &p); err != nil {
		s.fail(w, r, err)
		return
	}
	b, err := s.store.UpdateWorkBlock(r.Context(), userOf(r), id, func(cur domain.WorkBlock) (domain.WorkBlock, error) {
		next, err := domain.ApplyWorkBlockPatch(cur, p)
		if err != nil {
			return cur, err
		}
		it, err := s.store.GetItem(r.Context(), userOf(r), cur.ItemID)
		if err != nil {
			return cur, err
		}
		return next, domain.CheckBlockInItem(it, next.StartAt, next.EndAt)
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (s *Server) deleteWorkBlock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.DeleteWorkBlock(r.Context(), userOf(r), id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
