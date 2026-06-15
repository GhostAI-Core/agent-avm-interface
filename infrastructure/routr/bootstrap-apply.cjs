#!/usr/bin/env node
/**
 * Idempotent Routr Connect bootstrap via @routr/sdk (env-driven, no YAML parser).
 */
const SDK = require("@routr/sdk").default;

function normalizeEndpoint(raw) {
  const value = raw || "agent-avm-sip-routr:51908";
  return value.replace(/^insecure:\/\//, "").replace(/^https?:\/\//, "");
}

const endpoint = normalizeEndpoint(process.env.ROUTR_API);
const clientOpts = { endpoint, insecure: true };

async function waitForApi(peers) {
  let lastError = "unknown";
  for (let i = 0; i < 120; i++) {
    try {
      await peers.listPeers({ pageSize: 1 });
      return;
    } catch (err) {
      lastError = err.message || String(err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(
    `Routr API not reachable at ${endpoint} after 240s (last: ${lastError})`
  );
}

async function upsert(ref, getFn, createFn, updateFn, payload) {
  const { ref: _ref, ...body } = payload;
  try {
    await getFn(ref);
    console.log(`[routr-bootstrap] update ${ref}`);
    return updateFn({ ref, ...body });
  } catch {
    console.log(`[routr-bootstrap] create ${ref}`);
    return createFn({ ref, ...body });
  }
}

async function applyLiveKitAcl(acls) {
  const allow = process.env.ROUTR_LIVEKIT_ALLOWED_CIDRS;
  if (!allow) {
    return;
  }
  await upsert(
    "acl-livekit",
    (ref) => acls.getAcl(ref),
    (p) => acls.createAcl(p),
    (p) => acls.updateAcl(p),
    {
      ref: "acl-livekit",
      name: "LiveKit SIP sources",
      allow: [allow],
      deny: ["0.0.0.0/0"],
    }
  );
}

async function applyLiveKitPeer(apis) {
  const contactAddr =
    process.env.ROUTR_LIVEKIT_SIP_HOST || "sip.livekit.cloud:5060";
  const username = process.env.ROUTR_LIVEKIT_PEER_USERNAME || "livekit";
  const password = process.env.ROUTR_LIVEKIT_PEER_PASSWORD;

  let credentialsRef;
  let accessControlListRef;

  if (process.env.ROUTR_LIVEKIT_ALLOWED_CIDRS) {
    accessControlListRef = "acl-livekit";
  }

  if (password) {
    await upsert(
      "cred-livekit",
      (ref) => apis.credentials.getCredentials(ref),
      (p) => apis.credentials.createCredentials(p),
      (p) => apis.credentials.updateCredentials(p),
      {
        ref: "cred-livekit",
        name: "LiveKit peer credentials",
        username,
        password,
      }
    );
    credentialsRef = "cred-livekit";
  }

  const peer = {
    ref: "peer-livekit",
    name: "LiveKit Cloud",
    aor: "sip:livekit@evra.local",
    contactAddr,
    withSessionAffinity: false,
    extended: { evraRole: "livekit-sip-gateway" },
  };
  if (username && password) {
    peer.username = username;
  }
  if (credentialsRef) {
    peer.credentialsRef = credentialsRef;
  }
  if (accessControlListRef) {
    peer.accessControlListRef = accessControlListRef;
  }

  await upsert(
    "peer-livekit",
    (ref) => apis.peers.getPeer(ref),
    (p) => apis.peers.createPeer(p),
    (p) => apis.peers.updatePeer(p),
    peer
  );
}

async function applyCarrierTrunk(apis) {
  const host = process.env.ROUTR_CARRIER_SIP_HOST;
  if (!host) {
    return;
  }

  const name = process.env.ROUTR_CARRIER_NAME || "carrier";
  const port = Number(process.env.ROUTR_CARRIER_SIP_PORT || 5060);
  const username = process.env.ROUTR_CARRIER_SIP_USERNAME;
  const password = process.env.ROUTR_CARRIER_SIP_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "ROUTR_CARRIER_SIP_HOST is set but ROUTR_CARRIER_SIP_USERNAME/PASSWORD are missing"
    );
  }

  await upsert(
    "cred-carrier",
    (ref) => apis.credentials.getCredentials(ref),
    (p) => apis.credentials.createCredentials(p),
    (p) => apis.credentials.updateCredentials(p),
    {
      ref: "cred-carrier",
      name: `${name} credentials`,
      username,
      password,
    }
  );

  await upsert(
    "trunk-carrier-default",
    (ref) => apis.trunks.getTrunk(ref),
    (p) => apis.trunks.createTrunk(p),
    (p) => apis.trunks.updateTrunk(p),
    {
      ref: "trunk-carrier-default",
      name,
      inboundUri: `${name}.evra.local`,
      outboundCredentialsRef: "cred-carrier",
      sendRegister: false,
      uris: [
        {
          host,
          port,
          transport: "udp",
          user: username,
          weight: 1,
          priority: 1,
          enabled: true,
        },
      ],
      extended: { evraCarrier: name },
    }
  );
}

async function main() {
  console.log(`[routr-bootstrap] SDK endpoint=${endpoint}`);

  const apis = {
    acls: new SDK.Acls(clientOpts),
    credentials: new SDK.Credentials(clientOpts),
    peers: new SDK.Peers(clientOpts),
    trunks: new SDK.Trunks(clientOpts),
  };

  await waitForApi(apis.peers);
  console.log("[routr-bootstrap] Routr API is up");

  await applyLiveKitAcl(apis.acls);
  await applyLiveKitPeer(apis);
  await applyCarrierTrunk(apis);
}

main().catch((err) => {
  console.error("[routr-bootstrap] ERROR:", err.message || err);
  process.exit(1);
});
