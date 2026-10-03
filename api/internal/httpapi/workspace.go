package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
)

func (s *Server) registerWorkspace(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/workspace", s.getWorkspace)
	mux.HandleFunc("PUT /api/v1/workspace", s.putWorkspace)
}

func (s *Server) getWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, err := s.store.GetOrCreateWorkspace(r.Context(), userOf(r), domain.DefaultLayout())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) putWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Layout json.RawMessage `json:"layout"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		s.fail(w, r, err)
		return
	}
	if err := domain.ValidateLayout(body.Layout); err != nil {
		s.fail(w, r, err)
		return
	}
	ws, err := s.store.PutWorkspace(r.Context(), userOf(r), body.Layout)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}
