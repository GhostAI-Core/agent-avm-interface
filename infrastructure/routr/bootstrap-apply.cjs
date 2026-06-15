#!/usr/bin/env node
/**
 * Apply rendered Routr YAML (v2beta1) via @routr/sdk — idempotent create/update by ref.
 * Invoked from bootstrap.sh after envsubst; requires: npx -p @routr/sdk -p js-yaml
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const SDK = require("@routr/sdk").default;

const endpoint = process.env.ROUTR_API || "insecure://agent-avm-sip-routr:51908";
const clientOpts = { endpoint, insecure: true };

const KIND_ORDER = {
  AccessControlList: 1,
  Credentials: 2,
  Peer: 3,
  Trunk: 4,
};

async function waitForApi(peers) {
  for (let i = 0; i < 90; i++) {
    try {
      await peers.listPeers({ pageSize: 1 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Routr API not reachable after 180s");
}

async function upsert(api, ref, getFn, createFn, updateFn, payload) {
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

function yamlToCredentials(doc) {
  return {
    ref: doc.ref,
    name: doc.metadata.name,
    username: doc.spec.credentials.username,
    password: doc.spec.credentials.password,
    extended: doc.spec.extended,
  };
}

function yamlToAcl(doc) {
  return {
    ref: doc.ref,
    name: doc.metadata.name,
    allow: doc.spec.accessControlList.allow,
    deny: doc.spec.accessControlList.deny,
    extended: doc.spec.extended,
  };
}

function yamlToPeer(doc) {
  const lb = doc.spec.loadBalancing || {};
  return {
    ref: doc.ref,
    name: doc.metadata.name,
    aor: doc.spec.aor,
    username: doc.spec.username,
    contactAddr: doc.spec.contactAddr,
    credentialsRef: doc.spec.credentialsRef,
    accessControlListRef: doc.spec.accessControlListRef,
    withSessionAffinity: lb.withSessionAffinity ?? false,
    extended: doc.spec.extended,
  };
}

function yamlToTrunk(doc) {
  const outbound = doc.spec.outbound || {};
  const inbound = doc.spec.inbound || {};
  const uris = (outbound.uris || []).map((entry) => {
    const u = entry.uri || entry;
    return {
      host: u.host,
      port: u.port,
      transport: u.transport,
      user: u.user,
      weight: entry.weight ?? 1,
      priority: entry.priority ?? 1,
      enabled: entry.enabled !== false,
    };
  });
  return {
    ref: doc.ref,
    name: doc.metadata.name,
    inboundUri: inbound.uri,
    accessControlListRef: inbound.accessControlListRef,
    inboundCredentialsRef: inbound.credentialsRef,
    outboundCredentialsRef: outbound.credentialsRef,
    sendRegister: outbound.sendRegister ?? false,
    uris,
    extended: doc.spec.extended,
  };
}

async function applyDoc(doc, apis) {
  switch (doc.kind) {
    case "Credentials":
      return upsert(
        apis.credentials,
        doc.ref,
        (ref) => apis.credentials.getCredentials(ref),
        (p) => apis.credentials.createCredentials(p),
        (p) => apis.credentials.updateCredentials(p),
        yamlToCredentials(doc)
      );
    case "AccessControlList":
      return upsert(
        apis.acls,
        doc.ref,
        (ref) => apis.acls.getAcl(ref),
        (p) => apis.acls.createAcl(p),
        (p) => apis.acls.updateAcl(p),
        yamlToAcl(doc)
      );
    case "Peer":
      return upsert(
        apis.peers,
        doc.ref,
        (ref) => apis.peers.getPeer(ref),
        (p) => apis.peers.createPeer(p),
        (p) => apis.peers.updatePeer(p),
        yamlToPeer(doc)
      );
    case "Trunk":
      return upsert(
        apis.trunks,
        doc.ref,
        (ref) => apis.trunks.getTrunk(ref),
        (p) => apis.trunks.createTrunk(p),
        (p) => apis.trunks.updateTrunk(p),
        yamlToTrunk(doc)
      );
    default:
      console.warn(`[routr-bootstrap] skip unknown kind: ${doc.kind}`);
  }
}

async function main() {
  const files = process.argv.slice(2).filter((f) => f.endsWith(".yaml"));
  if (files.length === 0) {
    console.log("[routr-bootstrap] no YAML files to apply");
    return;
  }

  const peers = new SDK.Peers(clientOpts);
  await waitForApi(peers);
  console.log("[routr-bootstrap] Routr API is up");

  const apis = {
    acls: new SDK.Acls(clientOpts),
    credentials: new SDK.Credentials(clientOpts),
    peers,
    trunks: new SDK.Trunks(clientOpts),
  };

  const docs = files
    .map((file) => {
      const raw = fs.readFileSync(file, "utf8");
      const doc = yaml.load(raw);
      return { file, doc, order: KIND_ORDER[doc.kind] ?? 99 };
    })
    .sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));

  for (const { file, doc } of docs) {
    console.log(`[routr-bootstrap] applying ${path.basename(file)}`);
    await applyDoc(doc, apis);
  }
}

main().catch((err) => {
  console.error("[routr-bootstrap] ERROR:", err.message || err);
  process.exit(1);
});
