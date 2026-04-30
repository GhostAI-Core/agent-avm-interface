/**
 * Security utilities for the AVM platform.
 * Implements data encryption at rest/transit requirements from the tech spec.
 */

/**
 * Encrypts sensitive data (mock implementation for demo).
 * In production, this would use Web Crypto API or a library like 'crypto-js'.
 */
export function encryptSensitive(data: string): string {
  // Simple Base64 + obfuscation for demo
  return btoa(`ENC_${data}`).split('').reverse().join('')
}

/**
 * Decrypts sensitive data.
 */
export function decryptSensitive(cipher: string): string {
  const reversed = cipher.split('').reverse().join('')
  return atob(reversed).replace('ENC_', '')
}

/**
 * Masks PII (Personally Identifiable Information).
 * Used for phone numbers in logs to comply with privacy requirements.
 */
export function maskPhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')
}
