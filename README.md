# Ledger Infrastructure

Deployment and operations for the ledger platform: Helm chart, local Docker
Compose stack, observability configs (Prometheus + Grafana), CI deploy
workflows, load smoke tests, and capacity planning.

The application lives in [`ledger-service`](https://github.com/felipem554/ledger-service)
— a multi-tenant double-entry ledger (Kotlin / Spring Boot, PostgreSQL source
of truth, Kafka eventing, MongoDB read model, optional Kafka command-ingestion
write path).

## How the repos fit together

Per the platform's [CI architecture](https://github.com/felipem554/ledger-service/blob/main/docs/ci-architecture.md),
repos communicate through **published image tags and trigger events**, never
cross-repo checkouts:

- **ledger-service** tests, builds, and publishes `ghcr.io/felipem554/ledger-service:<sha>`.
  It holds no cluster credentials.
- **ledger-infra** (this repo) owns the Helm chart, the environments, and the
  kube credentials, and deploys a published tag.
- **ledger-load-tests** verifies a deployed URL with k6 (this repo keeps only a
  minimal post-deploy smoke test in [`k6/smoke.js`](k6/smoke.js)).

## Local dev stack

Runs the published `ledger-service` API image alongside PostgreSQL, MongoDB,
Kafka (KRaft), Prometheus, and Grafana, with all Kafka topics pre-created and
command ingestion enabled:

```bash
cd docker && docker compose up -d
```

| Service    | Host address     | Notes |
|------------|------------------|-------|
| Ledger API | localhost:8080   | `/healthz`, `/readyz`, `/actuator/prometheus` |
| PostgreSQL | localhost:5432   | source of truth (`ledger`/`ledger`) |
| MongoDB    | localhost:27017  | read model |
| Kafka      | localhost:19092  | EXTERNAL listener for host tools; containers use `kafka:9092` |
| Prometheus | localhost:9090   | scrapes the API every 10s |
| Grafana    | localhost:3000   | admin/admin — *Ledger* dashboards pre-provisioned |

All settings have safe defaults; the stack works with no configuration. To
override credentials, toggle command ingestion, or run a locally built image,
copy `.env.example`:

```bash
cp docker/.env.example docker/.env
# edit docker/.env — e.g. LEDGER_SERVICE_IMAGE=ledger-service:local
```

Kafka topics are created by the `kafka-init` container (auto-create is off):
`ledger.transactions.v1` (128 partitions, mirrors the app's partition buckets),
`ledger.commands.transactions.v1` / `ledger.commands.results.v1` (32, the
prod/staging layout), and the two DLQs (12).

## Helm deploy

The chart is [`helm/ledger`](helm/ledger). Sensitive values (database
passwords) live in a Kubernetes Secret rendered from `secretEnv`.
**Never commit real credentials to values files** — pass them at deploy time:

```bash
# Staging
helm upgrade --install ledger ./helm/ledger \
  --namespace ledger-staging \
  -f helm/ledger/values.yaml -f helm/ledger/values-staging.yaml \
  --set image.tag=<sha> \
  --set secretEnv.POSTGRES_PASSWORD=<password>

# Production
helm upgrade --install ledger ./helm/ledger \
  --namespace ledger-prod \
  -f helm/ledger/values.yaml -f helm/ledger/values-prod.yaml \
  --set image.tag=<tag> \
  --set secretEnv.POSTGRES_PASSWORD=<password> \
  --atomic --timeout 10m
```

What the chart manages: Deployment (with `/readyz` and `/healthz` probes and a
secret-checksum annotation so pods roll on credential changes), Service,
Ingress (nginx, sized for the 500-item batch endpoint), HPA, PodDisruptionBudget,
Secret, and — in production — a NetworkPolicy restricting API ingress to the
ingress-controller and monitoring namespaces.

The Kafka command-ingestion write path ships **disabled**
(`env.COMMAND_INGEST_ENABLED: "false"`); enable it per environment once the
command topics exist. Rollback is flipping it back off.

## CI / CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| [`pr-checks.yml`](.github/workflows/pr-checks.yml) | PRs to `main` | `helm lint` + render both env overlays, `docker compose config`, capacity-script smoke run |
| [`deploy-staging.yml`](.github/workflows/deploy-staging.yml) | `repository_dispatch: image-published` from ledger-service, or manual | Helm deploy of the given image tag to staging + k6 smoke test |
| [`release-prod.yml`](.github/workflows/release-prod.yml) | `v*` tag on this repo | Helm deploy of the matching image tag to production (`--atomic`) + k6 smoke and health verification |

Required repo secrets: `KUBE_CONFIG_STAGING` / `KUBE_CONFIG_PROD`,
`POSTGRES_PASSWORD_STAGING` / `POSTGRES_PASSWORD_PROD`, `STAGING_URL` /
`PROD_URL`. The ledger-service repo needs only a narrow, trigger-only token to
send the `image-published` dispatch — it never gains cluster access.

## Observability

Prometheus scrapes the API's Micrometer endpoint (`/actuator/prometheus`).
Grafana is pre-provisioned with the dashboards maintained in the
ledger-service repo (kept in sync here):

- **Ledger — Overview**: posting rate & latency percentiles, idempotency hits,
  outbox lag, command-ingestion throughput/results/DLQ.
- **Ledger — JVM & HTTP**: request rate by status, per-URI latency, heap, GC,
  CPU, Hikari pool.

## Capacity planning

First-pass sizing (Kafka partitions, projection workers, API replicas) from a
target transaction rate:

```bash
python scripts/capacity_calc.py --tps 5000
python scripts/capacity_calc.py --tps 5000 --entries 6
```

Validate against k6 runs and production telemetry.
