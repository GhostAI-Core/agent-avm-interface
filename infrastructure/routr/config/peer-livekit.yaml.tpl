apiVersion: v2beta1
kind: Peer
ref: peer-livekit
metadata:
  name: LiveKit Cloud
spec:
  aor: sip:livekit@evra.local
  contactAddr: "${ROUTR_LIVEKIT_SIP_HOST}"
  loadBalancing:
    algorithm: round-robin
    withSessionAffinity: false
  extended:
    evraRole: livekit-sip-gateway
