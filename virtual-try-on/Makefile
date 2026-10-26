SHELL := /bin/bash
COMPOSE := docker compose
.PHONY: bootstrap dev down test lint build e2e e2e-clean
bootstrap:
	./scripts/bootstrap.sh
dev:
	$(COMPOSE) build api web
	$(COMPOSE) run --rm --no-deps api ./mvnw -B -DskipTests package
	$(COMPOSE) up -d db api worker web
	./scripts/wait-ready.sh
down:
	$(COMPOSE) down
test:
	$(COMPOSE) up -d db
	$(COMPOSE) run --rm backend-tests
	$(COMPOSE) run --rm --no-deps web npm test
lint:
	$(COMPOSE) run --rm --no-deps web npm run lint
build:
	docker build --target runtime -t virtualwardrobe-backend:local services/backend
	$(COMPOSE) run --rm --no-deps web npm run build
e2e:
	./scripts/e2e.sh

e2e-clean:
	python3 scripts/e2e-clean.py

.PHONY: ai-benchmark
ai-benchmark:
	MODE="$(or $(MODE),mock)" PAIRS="$(or $(PAIRS),3)" MANIFEST="$(or $(MANIFEST),/project/docs/evaluations/synthetic-manifest.json)" MAX_USD="$(or $(MAX_USD),0)" ./scripts/ai-benchmark.sh

.PHONY: bootstrap-admin
bootstrap-admin:
	./scripts/bootstrap-admin.sh

.PHONY: demo-seed demo-status demo-cleanup demo-cleanup-execute
demo-seed:
	./scripts/demo.sh seed
demo-status:
	./scripts/demo.sh status
demo-cleanup:
	./scripts/demo.sh cleanup
demo-cleanup-execute:
	./scripts/demo.sh cleanup-execute
