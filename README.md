# Ledger Infrastructure

Helm charts, Docker Compose, and observability configs for the Distributed Ledger Platform.

## Local Dev Stack

```bash
cd docker && docker compose up -d
```

All services have safe defaults and the stack works without any configuration.
To override credentials or use a locally-built image, copy `.env.example` to `.env`:

```bash
cp docker/.env.example docker/.env
# edit docker/.env as needed
```

| Service    | Port  |
|------------|-------|
| PostgreSQL | 5432  |
| MongoDB    | 27017 |
| Kafka      | 9092  |
| Prometheus | 9090  |
| Grafana    | 3000  |

## Helm Deploy

Sensitive values (database passwords, etc.) are stored in a Kubernetes Secret.
**Never commit real credentials to values files.** Pass them at deploy time:

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

## Capacity Planning

```bash
python scripts/capacity_calc.py --tps 5000
python scripts/capacity_calc.py --tps 5000 --entries 6
```
