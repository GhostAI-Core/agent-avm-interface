apiVersion: v2beta1
kind: AccessControlList
ref: acl-livekit
metadata:
  name: LiveKit SIP sources
spec:
  accessControlList:
    allow:
      - "${ROUTR_LIVEKIT_ALLOWED_CIDRS}"
    deny:
      - 0.0.0.0/0
