package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/auth"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/httpapi"
	"github.com/Jeffrey-F-Guo/ai-calendar/api/internal/store"
)

type config struct {
	DatabaseURL     string
	Port            string
	AppEnv          string
	AuthMode        string
	CORSOrigins     []string
	SupabaseURL     string
	SupabaseJWKSURL string
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func loadConfig() config {
	return config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		Port:            env("PORT", "8080"),
		AppEnv:          env("APP_ENV", "development"),
		AuthMode:        env("AUTH_MODE", "dev"),
		CORSOrigins:     strings.Split(env("CORS_ORIGINS", "http://localhost:8081"), ","),
		SupabaseURL:     os.Getenv("SUPABASE_URL"),
		SupabaseJWKSURL: os.Getenv("SUPABASE_JWKS_URL"),
	}
}

func buildAuthenticator(ctx context.Context, cfg config) (auth.Authenticator, error) {
	switch cfg.AuthMode {
	case "dev":
		if cfg.AppEnv == "production" {
			return nil, errors.New("AUTH_MODE=dev is not allowed when APP_ENV=production")
		}
		return auth.DevAuth{}, nil
	default:
		return nil, fmt.Errorf("unsupported AUTH_MODE %q", cfg.AuthMode)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	cfg := loadConfig()
	if cfg.DatabaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer pool.Close()

	authn, err := buildAuthenticator(ctx, cfg)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(store.New(pool), authn, httpapi.Options{CORSOrigins: cfg.CORSOrigins, Logger: logger}),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	logger.Info("listening", "addr", srv.Addr, "auth_mode", cfg.AuthMode)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(context.Background(), logger); err != nil {
		logger.Error("server exited", "err", err)
		os.Exit(1)
	}
}
