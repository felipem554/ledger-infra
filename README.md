# Ledger Infrastructure

Helm charts, Docker Compose, and observability configs for the Distributed Ledger Platform.

## Local Dev Stack

```bash
cd docker && docker compose up -d
```

| Service    | Port  |
|------------|-------|
| PostgreSQL | 5432  |
| MongoDB    | 27017 |
| Kafka      | 9092  |
| Prometheus | 9090  |
| Grafana    | 3000  |

## Helm Deploy

```bash
# Staging
helm upgrade --install ledger ./helm/ledger \
  --namespace ledger-staging \
  -f helm/ledger/values.yaml -f helm/ledger/values-staging.yaml \
  --set image.tag=<sha>

# Production
helm upgrade --install ledger ./helm/ledger \
  --namespace ledger-prod \
  -f helm/ledger/values.yaml -f helm/ledger/values-prod.yaml \
  --set image.tag=<tag> --atomic --timeout 10m
```
