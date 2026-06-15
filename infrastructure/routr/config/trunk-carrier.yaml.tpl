apiVersion: v2beta1
kind: Trunk
ref: trunk-carrier-default
metadata:
  name: "${ROUTR_CARRIER_NAME:-carrier}"
  region: za
spec:
  inbound:
    uri: "${ROUTR_CARRIER_NAME:-carrier}.evra.local"
  outbound:
    sendRegister: false
    credentialsRef: cred-carrier
    uris:
      - uri:
          host: "${ROUTR_CARRIER_SIP_HOST}"
          port: ${ROUTR_CARRIER_SIP_PORT}
          transport: udp
        enabled: true
  extended:
    evraCarrier: "${ROUTR_CARRIER_NAME:-carrier}"
