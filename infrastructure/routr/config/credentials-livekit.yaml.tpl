apiVersion: v2beta1
kind: Credentials
ref: cred-livekit
metadata:
  name: LiveKit peer credentials
spec:
  credentials:
    username: "${ROUTR_LIVEKIT_PEER_USERNAME:-livekit}"
    password: "${ROUTR_LIVEKIT_PEER_PASSWORD}"
