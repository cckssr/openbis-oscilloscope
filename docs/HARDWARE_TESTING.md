# Hardware Integration Testing

This runbook explains how to run the full hardware-in-the-loop test suite against real LAN-connected oscilloscopes and a real OpenBIS instance.

## Prerequisites

- Python venv with dev dependencies installed: `pip install -e ".[dev,integration]"`
- At least one oscilloscope reachable over LAN with SCPI/VXI-11
- A valid OpenBIS session token with write access to a test space
- For Playwright E2E tests: Node.js + `npm install` inside `openbis_webapp/`

---

## 1 — Populate `config/oscilloscopes.test.yaml`

This file is gitignored. Copy the example and fill in real values:

```bash
cp config/oscilloscopes.test.yaml config/oscilloscopes.test.yaml.bak  # already exists
```

Edit `config/oscilloscopes.test.yaml`:

```yaml
oscilloscopes:
  - id: scope-01
    ip: 192.168.1.101       # real LAN IP
    port: 5025              # 5025 for raw SCPI, 111 for VXI-11
    label: "Rigol DS1054Z"
    driver: drivers.rigol_ds1054z.RigolDS1054Z  # real driver class path

  - id: scope-02
    ip: 192.168.1.102
    port: 5025
    label: "Rigol DS1054Z (B)"
    driver: drivers.rigol_ds1054z.RigolDS1054Z
```

Devices with `driver: "mock"` are ignored by the test suite.

---

## 2 — Obtain an OpenBIS session token

Log in via the OpenBIS web UI and copy the session token from your profile, or generate one programmatically:

```python
from pybis import Openbis
o = Openbis("https://openbis.example.com")
o.login("username", "password")
print(o.token)
```

Export to your shell:

```bash
export OPENBIS_TOKEN="your-session-token-here"
export OPENBIS_URL="https://openbis.example.com"
export OPENBIS_TEST_SPACE="/MY_SPACE/MY_PROJECT/MY_EXP"  # writable experiment
```

---

## 3 — Layer 1: Backend integration tests

### Quick: smoke test a single device

Start the app first (no real Redis needed — `DEBUG=False` but fakeredis is used by the test fixtures):

```bash
pytest tests/integration --hw \
    --openbis-url $OPENBIS_URL \
    --openbis-token $OPENBIS_TOKEN \
    -v
```

For commit tests (creates real datasets in OpenBIS):

```bash
pytest tests/integration --hw \
    --openbis-url $OPENBIS_URL \
    --openbis-token $OPENBIS_TOKEN \
    --openbis-test-space $OPENBIS_TEST_SPACE \
    -v
```

For the semi-manual health recovery test (requires physical cable unplugging):

```bash
pytest tests/integration/test_health_recovery.py --hw -s
```

### CLI smoke script (no pytest)

The smoke script exercises all endpoints against a running server:

```bash
# Start server in a separate terminal:
uvicorn app.main:app --reload

# Run the smoke test:
python scripts/smoke_test_hardware.py \
    --base-url http://127.0.0.1:8000 \
    --token $OPENBIS_TOKEN \
    --device scope-01
```

---

## 4 — Layer 2: Playwright E2E tests

```bash
cd openbis_webapp
npm install
npx playwright install chromium

# Set env vars
export OPENBIS_TEST_TOKEN=$OPENBIS_TOKEN
export OPENBIS_TEST_SPACE=$OPENBIS_TEST_SPACE
export OPENBIS_URL=$OPENBIS_URL
export HW_PRIMARY_DEVICE=scope-01     # first device ID in your test YAML
export HW_SECONDARY_DEVICE=scope-02   # second device (for multi-device tests)

# Run all E2E specs
npx playwright test

# Run with HTML report
npx playwright test --reporter=html
open playwright-report/index.html
```

Set `SKIP_WEBSERVER=1` if you want to start the FastAPI backend and Vite dev server yourself (useful for debugging):

```bash
# Terminal 1
uvicorn app.main:app --reload

# Terminal 2
cd openbis_webapp && npm run dev

# Terminal 3
cd openbis_webapp && SKIP_WEBSERVER=1 npx playwright test
```

### Manual visual checks

After Playwright passes, verify these by eye in the browser:

- [ ] Waveform plot renders without clipping or blank traces
- [ ] Screenshot thumbnail is crisp and matches the actual scope screen
- [ ] Archive waveform view matches what was acquired (no time/voltage axis swap)
- [ ] Plotly downsampling (to 2000 points) looks smooth — no visible aliasing on sine waves
- [ ] Commit success toast appears with a readable permId
- [ ] Device state badge colours: ONLINE (green), LOCKED (orange/yellow), OFFLINE (grey), ERROR (red)

---

## 5 — VM staging sign-off (before each release)

Deploy the branch to the production VM and run the same backend integration suite against it:

```bash
pytest tests/integration --hw \
    --openbis-url $OPENBIS_URL \
    --openbis-token $OPENBIS_TOKEN \
    --openbis-test-space $OPENBIS_TEST_SPACE \
    --hw-config config/oscilloscopes.test.yaml \
    -v
```

And the Playwright suite with the VM as the target:

```bash
cd openbis_webapp
SKIP_WEBSERVER=1 \
FRONTEND_URL=https://vm.lab.local \
BACKEND_URL=https://vm.lab.local/api \
npx playwright test
```

If either suite fails on the VM but passes locally, check:
1. `OSCILLOSCOPES_CONFIG` env var on the VM points to the right YAML
2. Redis is running and `REDIS_URL` is correct
3. `OPENBIS_URL` is reachable from the VM (not just your laptop)
4. Nginx is proxying `/api/` correctly (see `docs/deployment-nginx-native.md`)

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Could not connect to scope-01` | Wrong IP/port in `oscilloscopes.test.yaml`, or device off/firewall |
| `pytest.skip: No real-driver devices` | All devices have `driver: "mock"` in test YAML |
| `pass --openbis-url` skip message | Missing env var or `--openbis-url` flag |
| Acquire timeout (120 s) | Device busy, SCPI socket hung — power-cycle the scope |
| Playwright `getByRole` not found | UI labels are in German; update selectors in `e2e/*.spec.ts` if they changed |
| `OPENBIS_TEST_TOKEN` env not set | Playwright tests skip — export the token before running |
