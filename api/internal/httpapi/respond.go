package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/domain"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

const maxBodyBytes = 64 << 10

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field,omitempty"`
	} `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message, field string) {
	var body errorBody
	body.Error.Code, body.Error.Message, body.Error.Field = code, message, field
	writeJSON(w, status, body)
}

func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var ve *domain.ValidationError
	switch {
	case errors.As(err, &ve):
		writeError(w, http.StatusBadRequest, "validation_failed", ve.Message, ve.Field)
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "not found", "")
	default:
		s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "internal error", "")
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return &domain.ValidationError{Field: "body", Message: "invalid JSON body: " + err.Error()}
	}
	if dec.More() {
		return &domain.ValidationError{Field: "body", Message: "invalid JSON body: trailing data"}
	}
	return nil
}

// pathID treats a malformed id the same as an unknown one.
func pathID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		return uuid.Nil, store.ErrNotFound
	}
	return id, nil
}
