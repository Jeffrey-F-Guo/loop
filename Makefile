SHELL := /bin/bash
DATABASE_URL      ?= postgres://sprint:sprint@localhost:5433/sprint?sslmode=disable
TEST_DATABASE_URL ?= postgres://sprint:sprint@localhost:5433/sprint_test?sslmode=disable
E2E_DATABASE_URL  ?= postgres://sprint:sprint@localhost:5433/sprint_e2e?sslmode=disable
SQLC              ?= go tool sqlc
GOOSE             := cd api && go tool goose -dir ../db/migrations postgres

.PHONY: db-up db-down migrate migrate-test migrate-e2e sqlc api app dev test-api test-app test e2e

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

migrate: db-up
	$(GOOSE) "$(DATABASE_URL)" up

migrate-test: db-up
	$(GOOSE) "$(TEST_DATABASE_URL)" up

migrate-e2e: db-up
	$(GOOSE) "$(E2E_DATABASE_URL)" up

sqlc:
	cd api && $(SQLC) generate

api:
	cd api && DATABASE_URL="$(DATABASE_URL)" AUTH_MODE=dev go run ./cmd/server

app:
	cd app && npx expo start --web --port 8081

dev: migrate
	$(MAKE) -j2 api app

test-api: migrate-test
	cd api && TEST_DATABASE_URL="$(TEST_DATABASE_URL)" go test -p 1 ./...

test-app:
	cd app && npm test

test: test-api test-app

e2e: migrate-e2e
	cd app && EXPO_PUBLIC_API_URL=http://localhost:8090 EXPO_PUBLIC_AUTH_MODE=dev npx expo export --platform web --clear
	cd e2e && npm test
