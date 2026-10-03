// Package httpapi exposes the /api/v1 HTTP interface.
package httpapi

import (
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/auth"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

type Options struct {
	CORSOrigins []string
	Now         func() time.Time
	Logger      *slog.Logger
}

type Server struct {
	store *store.Store
	now   func() time.Time
	log   *slog.Logger
}

func New(st *store.Store, a auth.Authenticator, opts Options) http.Handler {
	s := &Server{store: st, now: opts.Now, log: opts.Logger}
	if s.now == nil {
		s.now = time.Now
	}
	if s.log == nil {
		s.log = slog.Default()
	}

	api := http.NewServeMux()
	api.HandleFunc("POST /api/v1/items", s.createItem)
	api.HandleFunc("GET /api/v1/items", s.listItems)
	api.HandleFunc("GET /api/v1/items/{id}", s.getItem)
	api.HandleFunc("PATCH /api/v1/items/{id}", s.patchItem)
	api.HandleFunc("DELETE /api/v1/items/{id}", s.deleteItem)
	s.registerWorkBlocks(api)
	s.registerWorkspace(api)

	unauthorized := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required", "")
	})

	root := http.NewServeMux()
	root.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) })
	root.Handle("/api/v1/", auth.Middleware(a, unauthorized)(api))

	return s.recoverer(cors(opts.CORSOrigins, root))
}

// Task 7 replaces these two with real route registration.
func (s *Server) registerWorkBlocks(*http.ServeMux) {}
func (s *Server) registerWorkspace(*http.ServeMux)  {}

func userOf(r *http.Request) uuid.UUID {
	id, _ := auth.UserFrom(r.Context())
	return id
}

func cors(origins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(origins, origin) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Dev-User")
			h.Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.log.Error("panic", "path", r.URL.Path, "panic", rec)
				writeError(w, http.StatusInternalServerError, "internal", "internal error", "")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
