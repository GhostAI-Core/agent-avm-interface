# EVRA public site (evra-ai.com)

Static marketing + legal site for GhostAI / EVRA. Exists primarily to satisfy the **website
requirement on Meta's Tech Provider Access Verification** — the reviewer opens this URL and checks
it describes the same service as the free-text answer on the form.

Three pages, no build step, no JS, no dependency on the dashboard:

| Page | Purpose |
|------|---------|
| `index.html` | What the service is, the three-step flow, the press-1 consent model, contact |
| `privacy.html` | POPIA privacy policy, including a section on WhatsApp / Meta data |
| `terms.html` | Terms of service |

Brand tokens mirror `docs/brand-visual-style.md` (dark `#1F1F1F`, EVRA green `#37A660`, Michroma
wordmark, 4px radius, flat panels).

## Local

```bash
docker build -t evra-site:local .
docker run --rm -p 8099:80 evra-site:local
# http://localhost:8099
```

## Deploy

Same pattern as the dashboard: container on the external `shared` network, published through the
Cloudflare tunnel. Nothing is exposed to the host directly.

```bash
docker compose up -d --build
```

Then in **Cloudflare Zero Trust → Networks → Tunnels → [tunnel] → Public Hostname**, add:

| Public hostname | Tunnel target | Access policy |
|-----------------|---------------|---------------|
| `evra-ai.com` | `http://evra-site:80` | Public (no Access policy) |
| `www.evra-ai.com` | `http://evra-site:80` | Public |

The Access policy **must be public**. If Cloudflare Access is in front of it, Meta's reviewer hits
a login wall and the verification fails.

### DNS

`evra-ai.com` currently has no A/CNAME record at the apex — only the `avm.` and `call-center.`
subdomains resolve. Adding the public hostname in the tunnel UI creates the proxied CNAME
automatically. Confirm with:

```bash
curl -sI https://evra-ai.com | head -1        # expect HTTP/2 200
curl -s https://evra-ai.com/privacy.html | head -20
```

## Before submitting to Meta

- [ ] Site is publicly reachable with no login wall, from a browser that is not signed in
- [ ] Free-text answer on the Access Verification form matches what this site says
- [ ] Company registration number and registered address added (see below)

### Placeholders to fill

Both legal pages identify the business only as "GhostAI, South Africa". Add the registered
company name, CIPC registration number, and registered address once confirmed — Meta cross-checks
the business name on the form against the site, and a trading-name mismatch is a common rejection.
Search for `GhostAI, South Africa` in `privacy.html` and `terms.html`.

The clause on fees in `terms.html` defers to a separate written agreement rather than stating
prices. If there is no such agreement with clients yet, that clause needs revisiting.
