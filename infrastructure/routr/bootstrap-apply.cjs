#!/usr/bin/env node
/**
 * Idempotent Routr Connect bootstrap via @routr/sdk (env-driven, no YAML parser).
 */
const SDK = require("@routr/sdk").default;
const dns = require("dns").promises;

const CONTACT_ADDR_MAX_LEN = 20;

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

function isAlreadyExists(err) {
  return err?.code === 6 || String(err?.message || err).includes("ALREADY_EXISTS");
}

async function upsert(
  ref,
  getFn,
  createFn,
  updateFn,
  payload,
  resolveExistingRef
) {
  const body = { ...payload };
  delete body.ref;

  const update = async (targetRef, note) => {
    const suffix = note ? ` (${note})` : "";
    console.log(`[routr-bootstrap] update ${targetRef}${suffix}`);
    return updateFn({ ref: targetRef, ...body });
  };

  try {
    await getFn(ref);
    return update(ref);
  } catch {
    try {
      console.log(`[routr-bootstrap] create ${ref}`);
      return await createFn({ ref, ...body });
    } catch (err) {
      if (!isAlreadyExists(err) || !resolveExistingRef) {
        throw err;
      }
      const existingRef = await resolveExistingRef();
      if (!existingRef) {
        throw err;
      }
      return update(existingRef, "existing resource");
    }
  }
}

async function findPeerRefByUsername(peers, username) {
  const { items } = await peers.listPeers({ pageSize: 50 });
  return items?.find((p) => p.username === username)?.ref;
}

async function findCredentialsRefByName(credentials, name) {
  const { items } = await credentials.listCredentials({ pageSize: 50 });
  return items?.find((c) => c.name === name)?.ref;
}

async function findTrunkRefByInboundUri(trunks, inboundUri) {
  const { items } = await trunks.listTrunks({ pageSize: 50 });
  return items?.find((t) => t.inboundUri === inboundUri)?.ref;
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

/** Routr DB: contact_addr VARCHAR(20) — IP:port only; hostnames must be resolved. */
async function resolveContactAddr(raw) {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length <= CONTACT_ADDR_MAX_LEN) {
    return trimmed;
  }

  const match = trimmed.match(/^([^:]+):(\d+)$/);
  if (!match) {
    console.warn(
      `[routr-bootstrap] ROUTR_LIVEKIT_SIP_HOST "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars and is not host:port; omitting contactAddr`
    );
    return undefined;
  }

  const [, host, port] = match;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    console.warn(
      `[routr-bootstrap] ROUTR_LIVEKIT_SIP_HOST "${trimmed}" (${trimmed.length} chars) exceeds Routr limit (${CONTACT_ADDR_MAX_LEN}); omitting contactAddr`
    );
    return undefined;
  }

  try {
    const { address } = await dns.lookup(host, { family: 4 });
    const resolved = `${address}:${port}`;
    if (resolved.length > CONTACT_ADDR_MAX_LEN) {
      console.warn(
        `[routr-bootstrap] resolved ${trimmed} → ${resolved} still exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting contactAddr`
      );
      return undefined;
    }
    console.log(`[routr-bootstrap] resolved contactAddr ${trimmed} → ${resolved}`);
    return resolved;
  } catch (err) {
    console.warn(
      `[routr-bootstrap] DNS lookup failed for ${host} (${err.message}); omitting contactAddr`
    );
    return undefined;
  }
}

async function applyLiveKitPeer(apis) {
  const contactAddr = await resolveContactAddr(
    process.env.ROUTR_LIVEKIT_SIP_HOST || "sip.livekit.cloud:5060"
  );
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
    username,
    withSessionAffinity: false,
    extended: { evraRole: "livekit-sip-gateway" },
  };
  if (contactAddr) {
    peer.contactAddr = contactAddr;
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
    peer,
    () => findPeerRefByUsername(apis.peers, username)
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

  const credName = `${name} credentials`;
  const inboundUri = `${name}.evra.local`;

  const cred = await upsert(
    "cred-carrier",
    (ref) => apis.credentials.getCredentials(ref),
    (p) => apis.credentials.createCredentials(p),
    (p) => apis.credentials.updateCredentials(p),
    {
      ref: "cred-carrier",
      name: credName,
      username,
      password,
    },
    () => findCredentialsRefByName(apis.credentials, credName)
  );

  const carrierCredentialsRef = cred?.ref || "cred-carrier";

  await upsert(
    "trunk-carrier-default",
    (ref) => apis.trunks.getTrunk(ref),
    (p) => apis.trunks.createTrunk(p),
    (p) => apis.trunks.updateTrunk(p),
    {
      ref: "trunk-carrier-default",
      name,
      inboundUri,
      outboundCredentialsRef: carrierCredentialsRef,
      sendRegister: false,
      uris: [
        {
          host,
          port,
          transport: "UDP",
          user: username,
          weight: 1,
          priority: 1,
          enabled: true,
        },
      ],
      extended: { evraCarrier: name },
    },
    () => findTrunkRefByInboundUri(apis.trunks, inboundUri)
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
