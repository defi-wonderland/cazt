/**
 * CLI constants
 */

/**
 * Security warning messages for key operations
 */
export const WARNINGS = {
  KEY_GENERATE:
    'SECURITY WARNING: Store this secret key securely. Anyone with access can control associated accounts.',
  KEY_IMPORT:
    'SECURITY WARNING: Your secret key is stored locally. Ensure proper file permissions and backup.',
  KEY_EXPORT:
    'SECURITY WARNING: Handle this secret key carefully. Anyone with access can control associated accounts.',
  KEY_ENCRYPTED:
    'Your secret is encrypted. Remember your password - it cannot be recovered.',
  KEY_UNENCRYPTED:
    'SECURITY WARNING: Your secret is stored unencrypted. Consider using encryption for production keys.',
} as const;
