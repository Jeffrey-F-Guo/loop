package httpapi

import (
	"net/http"
	"net/url"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	var in domain.NewItem
	if err := decodeJSON(w, r, &in); err != nil {
		s.fail(w, r, err)
		return
	}
	in, err := in.Validate()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.CreateItem(r.Context(), userOf(r), in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, it)
}

func parseItemFilter(q url.Values) (store.ItemFilter, error) {
	var f store.ItemFilter
	switch q.Get("status") {
	case "", "active":
		v := domain.StatusActive
		f.Status = &v
	case "completed":
		v := domain.StatusCompleted
		f.Status = &v
	case "all":
	default:
		return f, &domain.ValidationError{Field: "status", Message: "status must be active, completed, or all"}
	}
	switch q.Get("scheduling") {
	case "", "all":
	case "scheduled":
		v := true
		f.Scheduled = &v
	case "unscheduled":
		v := false
		f.Scheduled = &v
	default:
		return f, &domain.ValidationError{Field: "scheduling", Message: "scheduling must be all, scheduled, or unscheduled"}
	}
	return f, nil
}

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	f, err := parseItemFilter(r.URL.Query())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	items, err := s.store.ListItems(r.Context(), userOf(r), f)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) getItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.GetItem(r.Context(), userOf(r), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, it)
}

func (s *Server) patchItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var p domain.ItemPatch
	if err := decodeJSON(w, r, &p); err != nil {
		s.fail(w, r, err)
		return
	}
	it, err := s.store.UpdateItem(r.Context(), userOf(r), id, func(cur domain.Item) (domain.Item, error) {
		return domain.ApplyItemPatch(cur, p, s.now())
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, it)
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.DeleteItem(r.Context(), userOf(r), id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
