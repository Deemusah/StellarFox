# Load Testing Infrastructure

This directory contains the load testing setup for StellarFox-Backend, using
[k6](https://k6.io/) as the load testing tool. The goal is to make performance
bottlenecks observable and to enable scalability planning.

## Prerequisites

Install k6 (see https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Debian/Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Running the tests

Start the backend first, then run a scenario against it.

```bash
# From StellarFox-Backend/
npm run load-test            # default: smoke scenario against http://localhost:3000
npm run load-test:smoke      # minimal sanity check
npm run load-test:load       # sustained load across key endpoints
npm run load-test:stress     # ramp up to find breaking points
```

Override the target and scenario via environment variables:

```bash
BASE_URL=https://staging.example.com k6 run load-tests/scenarios/load.js
```

## Scenarios

The scenarios exercise the key backend endpoints:

| Scenario | Endpoints                          | Purpose                                  |
| -------- | ---------------------------------- | ---------------------------------------- |
| smoke    | `/health`                          | Verify the service is reachable          |
| load     | `/health`, `/markets`, `/bets`     | Sustained realistic traffic              |
| stress   | `/health`, `/markets`, `/bets`     | Ramp up to identify breaking points      |

Each scenario defines thresholds so a run fails when performance regresses.

## Interpreting results

k6 prints a summary at the end of each run. Key metrics to watch:

- **http_req_duration** — request latency. `p(95)` and `p(99)` are the most
  useful for spotting tail latency problems.
- **http_req_failed** — fraction of failed requests. Should stay near 0.
- **http_reqs** — throughput (requests per second).
- **iterations** — completed scenario iterations.

Thresholds are configured per scenario (e.g. `p(95)<500`). A run exits non-zero
when a threshold is breached, which makes the tests suitable for CI.

### Identifying bottlenecks

1. Run the `load` scenario and note the `p(95)`/`p(99)` latency per endpoint.
2. Run the `stress` scenario and find the VU count where latency or error rate
   spikes — that is the current capacity ceiling.
3. Correlate slow endpoints with backend logs (see the log aggregation service)
   to locate the responsible query or handler.

## Repeatability

Scenarios use a fixed set of stages and thresholds, so results are comparable
across runs. Keep the backend configuration and dataset consistent between runs
when comparing numbers.
