# Ledger Infrastructure

Deployment and observability configs for the Distributed Ledger Platform — Helm
charts, a local Docker Compose stack, Prometheus/Grafana config, and the
production release pipeline.

## Role in the platform

This is one of several repos:

| Repo | Owns |
|------|------|
| **ledger-service** | The application — builds and **publishes the container image** to GHCR |
| **ledger-infra** (this repo) | **Deployment** — the Helm chart, environments, and the release pipeline (holds the kube credentials) |
| **ledger-load-tests** | k6 load scenarios |
| **ledger-system-design** | Architecture & design docs (ADRs, capacity, runbooks) |

The contract between repos is the **published image tag**. This repo consumes
`ghcr.io/felipem554/ledger-service:<tag>` and deploys it — it never builds the app.
See `ledger-service/docs/ci-architecture.md` for the full CI/deploy design.

## Local dev stack

Brings up Postgres, MongoDB, Kafka (with topics pre-created), Prometheus, Grafana,
and the app (built from a sibling `../ledger-service` checkout):

```bash
cd docker && docker compose up -d
```

Safe defaults; the stack runs with no configuration. To override credentials or
point at a pre-built image instead of building locally, copy the env file:

```bash
cp docker/.env.example docker/.env   # then edit
```

| Service    | Port  |
|------------|-------|
| ledger-service | 8080 (`/healthz`, `/actuator/prometheus`) |
| PostgreSQL | 5432  |
| MongoDB    | 27017 |
| Kafka      | 9092 (internal) / 19092 (host) |
| Prometheus | 9090  |
| Grafana    | 3000  |

> The app repo (`ledger-service`) also ships its own full dev stack
> (`docker/docker-compose.yml`). Use that for app development; use this one when
> you're working on the **infra/deploy** side (chart, prometheus, release flow).

### Kafka topics

`kafka-init` creates the topics up front (auto-create is off): the transaction
event topic and DLQ, plus the **command-ingestion** topics
(`ledger.commands.transactions.v1`, `.dlq.v1`, `.results.v1`). Command ingestion is
enabled in this stack (`COMMAND_INGEST_ENABLED=true`).

## Helm deploy

Sensitive values (DB passwords, etc.) live in a Kubernetes Secret.
**Never commit real credentials to values files.** Pass them at deploy time:

```bash
# Staging
helm upgrade --install ledger-service ./helm/ledger \
  --namespace ledger-staging \
  -f helm/ledger/values.yaml -f helm/ledger/values-staging.yaml \
  --set image.tag=<sha> \
  --set secretEnv.POSTGRES_PASSWORD=<password>

# Production
helm upgrade --install ledger-service ./helm/ledger \
  --namespace ledger-prod \
  -f helm/ledger/values.yaml -f helm/ledger/values-prod.yaml \
  --set image.tag=<tag> \
  --set secretEnv.POSTGRES_PASSWORD=<password> \
  --atomic --timeout 10m
```

`image.repository` defaults to `ghcr.io/felipem554/ledger-service`. To enable
Kafka command ingestion in a cluster, set `--set env.COMMAND_INGEST_ENABLED=true`.

## Release pipeline

- **`.github/workflows/pr-checks.yml`** — validates chart changes on PRs.
- **`.github/workflows/release-prod.yml`** — on a `v*` tag, deploys the matching
  `ledger-service` image to production via Helm and runs a post-deploy smoke test
  (`k6/smoke.js`) + health checks. Requires `KUBE_CONFIG_PROD` and `PROD_URL`
  secrets.

## Capacity planning

```bash
python scripts/capacity_calc.py --tps 5000
python scripts/capacity_calc.py --tps 5000 --entries 6
```
