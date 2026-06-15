apiVersion: v2beta1
kind: Credentials
ref: cred-carrier
metadata:
  name: "${ROUTR_CARRIER_NAME:-carrier} credentials"
spec:
  credentials:
    username: "${ROUTR_CARRIER_SIP_USERNAME}"
    password: "${ROUTR_CARRIER_SIP_PASSWORD}"
