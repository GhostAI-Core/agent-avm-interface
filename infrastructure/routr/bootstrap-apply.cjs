#!/usr/bin/env node
/**
 * @deprecated Use infrastructure/routr/bootstrap-run.ts (lib/routr via tsx).
 * Kept for reference; Docker bootstrap now runs bootstrap-run.ts.
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
      await peers.listPeers({ pageSize: 1, pageToken: "" });
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
  const msg = String(err?.message || err);
  return (
    err?.code === 6 ||
    msg.includes("ALREADY_EXISTS") ||
    msg.includes("duplicate key") ||
    msg.includes("unique constraint")
  );
}

async function upsert(
  ref,
  getFn,
  createFn,
  updateFn,
  payload,
  resolveExistingRef,
  options = {}
) {
  const body = { ...payload };
  delete body.ref;
  const omitOnUpdate = options.omitFieldsOnUpdate || [];

  const buildUpdate = (targetRef) => {
    const updatePayload = { ref: targetRef, ...body };
    for (const field of omitOnUpdate) {
      delete updatePayload[field];
    }
    return updatePayload;
  };

  const update = async (targetRef, note) => {
    const suffix = note ? ` (${note})` : "";
    console.log(`[routr-bootstrap] update ${targetRef}${suffix}`);
    return updateFn(buildUpdate(targetRef));
  };

  const create = async () => {
    console.log(`[routr-bootstrap] create ${ref}`);
    if (options.omitRefOnCreate) {
      return createFn({ ...body });
    }
    return createFn({ ref, ...body });
  };

  if (resolveExistingRef) {
    const existingRef = await resolveExistingRef();
    if (existingRef) {
      return update(existingRef, "existing resource");
    }
  }

  try {
    await getFn(ref);
    return update(ref);
  } catch {
    try {
      return await create();
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

function normalizePeerUsername(raw) {
  const value = (raw || "").trim();
  return value || "livekit";
}

async function upsertLiveKitPeer(peers, peerBody) {
  const username = normalizePeerUsername(peerBody.username);
  const createBody = {
    name: peerBody.name,
    username,
    aor: peerBody.aor,
    withSessionAffinity: peerBody.withSessionAffinity ?? false,
    enabled: true,
    extended: peerBody.extended,
  };
  if (peerBody.contactAddr) {
    const addr = enforceContactAddrLimit(peerBody.contactAddr);
    if (addr) createBody.contactAddr = addr;
    else {
      console.warn(
        `[routr-bootstrap] omitting contactAddr (${String(peerBody.contactAddr).length} chars exceeds Routr limit ${CONTACT_ADDR_MAX_LEN})`
      );
    }
  }
  if (peerBody.credentialsRef) createBody.credentialsRef = peerBody.credentialsRef;
  if (peerBody.accessControlListRef) {
    createBody.accessControlListRef = peerBody.accessControlListRef;
  }

  const updateBody = { ...createBody };
  delete updateBody.username;

  let existingRef = await findLiveKitPeerRef(peers, username);
  if (!existingRef) {
    try {
      await peers.getPeer("peer-livekit");
      existingRef = "peer-livekit";
    } catch {
      // not found
    }
  }

  if (existingRef) {
    console.log(`[routr-bootstrap] update peer ${existingRef}`);
    return peers.updatePeer({ ref: existingRef, ...updateBody });
  }

  console.log(`[routr-bootstrap] create peer (${username})`);
  try {
    return await peers.createPeer(createBody);
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    const found = await findLiveKitPeerRef(peers, username);
    if (!found) throw err;
    console.log(`[routr-bootstrap] update peer ${found} (existing resource)`);
    return peers.updatePeer({ ref: found, ...updateBody });
  }
}

async function findPeerRefByUsername(peers, username) {
  const { items } = await peers.listPeers({ pageSize: 50, pageToken: "" });
  return items?.find((p) => p.username === username)?.ref;
}

async function findPeerRefByName(peers, name) {
  const { items } = await peers.listPeers({ pageSize: 50, pageToken: "" });
  return items?.find((p) => p.name === name)?.ref;
}

async function findLiveKitPeerRef(peers, username) {
  const byUsername = await findPeerRefByUsername(peers, username);
  if (byUsername) return byUsername;
  const byName = await findPeerRefByName(peers, "LiveKit Cloud");
  if (byName) return byName;
  const { items } = await peers.listPeers({ pageSize: 50, pageToken: "" });
  return items?.find((p) => p.extended?.evraRole === "livekit-sip-gateway")?.ref;
}

async function findCredentialsRefByName(credentials, name) {
  const { items } = await credentials.listCredentials({ pageSize: 50, pageToken: "" });
  return items?.find((c) => c.name === name)?.ref;
}

async function findTrunkRefByInboundUri(trunks, inboundUri) {
  const { items } = await trunks.listTrunks({ pageSize: 50, pageToken: "" });
  return items?.find((t) => t.inboundUri === inboundUri)?.ref;
}

async function findTrunkRefByName(trunks, name) {
  const { items } = await trunks.listTrunks({ pageSize: 50, pageToken: "" });
  return items?.find((t) => t.name === name)?.ref;
}

async function findNumberRefByTelUrl(numbers, telUrl) {
  const { items } = await numbers.listNumbers({ pageSize: 50, pageToken: "" });
  return items?.find((n) => n.telUrl === telUrl)?.ref;
}

function normalizeOutboundCallerId(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  return trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
}

const LIVEKIT_PEER_AOR = "sip:livekit@evra.local";

async function applyOutboundCallerNumber(apis, trunkRef, callerId) {
  const e164 = normalizeOutboundCallerId(callerId);
  if (!e164) {
    throw new Error("ROUTR_OUTBOUND_CALLER_ID must be a valid E.164 number");
  }
  const telUrl = `tel:${e164}`;
  await upsert(
    "number-outbound-default",
    (ref) => apis.numbers.getNumber(ref),
    (p) => apis.numbers.createNumber(p),
    (p) => apis.numbers.updateNumber(p),
    {
      ref: "number-outbound-default",
      name: e164,
      telUrl,
      trunkRef,
      aorLink: LIVEKIT_PEER_AOR,
      country: "South Africa",
      countryISOCode: "ZA",
      extended: { evraRole: "outbound-caller-id" },
    },
    () => findNumberRefByTelUrl(apis.numbers, telUrl),
    { omitRefOnCreate: true }
  );
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
    },
    undefined,
    { omitRefOnCreate: true }
  );
}

function enforceContactAddrLimit(value) {
  if (!value || !String(value).trim()) return undefined;
  const trimmed = String(value).trim();
  if (trimmed.length > CONTACT_ADDR_MAX_LEN) return undefined;
  return trimmed;
}

/** Routr DB: contact_addr VARCHAR(20) — IP:port only; hostnames must be resolved. */
async function resolveContactAddr(raw) {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim().replace(/^sip:/i, "");
  const withinLimit = enforceContactAddrLimit(trimmed);
  if (withinLimit) {
    return withinLimit;
  }

  const match = trimmed.match(/^([^:]+):(\d+)$/);
  if (!match) {
    console.warn(
      `[routr-bootstrap] ROUTR_LIVEKIT_SIP_HOST "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting contactAddr`
    );
    return undefined;
  }

  const [, host, port] = match;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    console.warn(
      `[routr-bootstrap] contactAddr "${trimmed}" exceeds ${CONTACT_ADDR_MAX_LEN} chars; omitting contactAddr`
    );
    return undefined;
  }

  try {
    const { address } = await dns.lookup(host, { family: 4 });
    const resolved = `${address}:${port}`;
    const ok = enforceContactAddrLimit(resolved);
    if (!ok) {
      console.warn(
        `[routr-bootstrap] resolved ${trimmed} → ${resolved} (${resolved.length} chars) exceeds ${CONTACT_ADDR_MAX_LEN}; omitting contactAddr`
      );
      return undefined;
    }
    console.log(`[routr-bootstrap] resolved contactAddr ${trimmed} → ${resolved}`);
    return ok;
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
  const username = normalizePeerUsername(process.env.ROUTR_LIVEKIT_PEER_USERNAME);
  const password = process.env.ROUTR_LIVEKIT_PEER_PASSWORD;

  let credentialsRef;
  let accessControlListRef;

  if (process.env.ROUTR_LIVEKIT_ALLOWED_CIDRS) {
    accessControlListRef = "acl-livekit";
  }

  if (password) {
    const cred = await upsert(
      "cred-livekit",
      (ref) => apis.credentials.getCredentials(ref),
      (p) => apis.credentials.createCredentials(p),
      (p) => apis.credentials.updateCredentials(p),
      {
        ref: "cred-livekit",
        name: "LiveKit peer credentials",
        username,
        password,
      },
      () => findCredentialsRefByName(apis.credentials, "LiveKit peer credentials"),
      { omitRefOnCreate: true }
    );
    credentialsRef = cred?.ref;
  }

  await upsertLiveKitPeer(apis.peers, {
    name: "LiveKit Cloud",
    username,
    aor: "sip:livekit@evra.local",
    contactAddr,
    withSessionAffinity: false,
    credentialsRef,
    accessControlListRef,
    extended: { evraRole: "livekit-sip-gateway" },
  });
}

function carrierInboundUri(slug) {
  const label = String(slug)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
  if (!label) {
    throw new Error("ROUTR_CARRIER_NAME must yield a valid inbound URI label");
  }
  return `${label}.evra.local`;
}

function carrierSendRegisterFromEnv() {
  const v = String(process.env.ROUTR_CARRIER_SEND_REGISTER ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
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
  const inboundUri = carrierInboundUri(name);
  const sendRegister = carrierSendRegisterFromEnv();
  console.log(`[routr-bootstrap] carrier sendRegister=${sendRegister}`);

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
    () => findCredentialsRefByName(apis.credentials, credName),
    { omitRefOnCreate: true }
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
      sendRegister,
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
    () =>
      findTrunkRefByInboundUri(apis.trunks, inboundUri) ||
      findTrunkRefByName(apis.trunks, name),
    { omitRefOnCreate: true }
  );

  const callerId = process.env.ROUTR_OUTBOUND_CALLER_ID?.trim();
  const trunkRef =
    (await findTrunkRefByInboundUri(apis.trunks, inboundUri)) ||
    (await findTrunkRefByName(apis.trunks, name));
  if (callerId && trunkRef) {
    await applyOutboundCallerNumber(apis, trunkRef, callerId);
  } else if (!callerId) {
    console.log(
      "[routr-bootstrap] skip outbound Number (set ROUTR_OUTBOUND_CALLER_ID for peer-to-pstn)"
    );
  }
}

async function main() {
  console.log(`[routr-bootstrap] SDK endpoint=${endpoint}`);

  const apis = {
    acls: new SDK.Acls(clientOpts),
    credentials: new SDK.Credentials(clientOpts),
    peers: new SDK.Peers(clientOpts),
    trunks: new SDK.Trunks(clientOpts),
    numbers: new SDK.Numbers(clientOpts),
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
