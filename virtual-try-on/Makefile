SHELL := /bin/bash
COMPOSE := docker compose
.PHONY: bootstrap dev down test lint build e2e
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
	./scripts/wait-ready.sh
	$(COMPOSE) build e2e
	$(COMPOSE) run --rm e2e

.PHONY: ai-benchmark
ai-benchmark:
	MODE="$(or $(MODE),mock)" PAIRS="$(or $(PAIRS),3)" MANIFEST="$(or $(MANIFEST),/project/docs/evaluations/synthetic-manifest.json)" MAX_USD="$(or $(MAX_USD),0)" ./scripts/ai-benchmark.sh
