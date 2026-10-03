.DEFAULT_GOAL := help
.PHONY: help install build typecheck test test-build test-e2e check ci dev dev-dry docs-build docs-preview pack clean distclean

NPM ?= npm

node_modules: package.json package-lock.json
	$(NPM) ci
	@touch $@

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: node_modules ## Install dependencies from package-lock.json

build: node_modules ## Compile the package to dist/
	$(NPM) run build

typecheck: node_modules ## Run the TypeScript check
	$(NPM) run typecheck

test: node_modules ## Run the unit tests
	$(NPM) test

test-build: node_modules ## Build the docs site and make sure it has no review code
	$(NPM) run test:build

test-e2e: node_modules ## Run the dry-run test in headless Chromium (set CHROME_PATH if needed)
	$(NPM) run test:e2e

check: typecheck test ## Run the typecheck and the unit tests

ci: check build test-build test-e2e ## Run all checks, the build, and all tests

dev: node_modules ## Start the docs dev server with the review UI
	$(NPM) run docs:dev

dev-dry: node_modules ## Start the docs dev server in dry-run mode (no requests to GitHub)
	$(NPM) run docs:dev:dry

docs-build: node_modules ## Make a production build of the docs site
	$(NPM) run docs:build

docs-preview: docs-build ## Serve the production build of the docs site
	$(NPM) run docs:preview

pack: node_modules ## Make the npm package tarball (.tgz)
	$(NPM) pack

clean: ## Remove build output, the docs cache, and tarballs
	rm -rf dist docs/.vitepress/cache docs/.vitepress/dist *.tgz

distclean: clean ## Remove build output and node_modules
	rm -rf node_modules
