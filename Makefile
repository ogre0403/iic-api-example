SERVICE :=

.PHONY: swagger doc-up doc-down


swagger:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: SERVICE is not set. Please specify a service name, e.g.:"; \
		echo "  make swagger SERVICE=<name>"; \
		echo ""; \
		echo "Available services:"; \
		ls swagger/*.yaml 2>/dev/null | xargs -I{} basename {} .yaml | sed 's/^/  /'; \
		exit 1; \
	fi
	docker run -ti --rm -p 8088:8080 -v `pwd`/swagger/$(SERVICE).yaml:/app/swagger.json swaggerapi/swagger-ui:v5.20.2


doc-up:
	docker compose up -d

doc-down:
	docker compose down

