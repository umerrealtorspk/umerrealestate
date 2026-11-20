/**
 * Pakistani Phone & Contact Number Utilities
 * Validates and standardizes Pakistani mobile and landline numbers for real estate listings.
 */

/**
 * Validates if a contact string contains a genuine, reachable phone number.
 * Discards empty, "-", "N/A", "Unknown", or non-phone strings.
 */
export function isValidContactNumber(phone?: string | null): boolean {
  if (!phone || typeof phone !== 'string') return false;
  
  const trimmed = phone.trim().toLowerCase();
  
  // Reject common non-contact placeholders
  const blacklisted = [
    '',
    '-',
    '--',
    '---',
    'n/a',
    'na',
    'none',
    'null',
    'undefined',
    'unknown',
    'direct',
    'direct deal',
    'direct owner',
    'owner',
    'dealer',
    'broadcast',
    'nil',
    'call',
    'contact'
  ];
  
  if (blacklisted.includes(trimmed)) return false;

  // Extract digits
  const digits = trimmed.replace(/\D/g, '');

  // Pakistani mobile numbers are 11 digits (03001234567) or 12 digits (+923001234567)
  // Landlines with area code (042-35780000) are 10-11 digits
  if (digits.length < 10 || digits.length > 14) return false;

  // Must match typical Pakistani mobile/phone pattern:
  // Starts with 03xx, 923xx, 00923xx, +923xx, or 042 / 051
  const isPakistaniPattern = /^(?:0?3\d{9}|923\d{9}|00923\d{9}|042\d{7,8}|051\d{7,8}|021\d{7,8})$/.test(digits);
  
  // If it has at least 10 digits and starts with 3 or 92 or 03, accept
  return isPakistaniPattern || (digits.length >= 10 && (digits.startsWith('03') || digits.startsWith('923') || digits.startsWith('3')));
}

/**
 * Standardizes a phone number into readable format: e.g. "0300 1234567"
 */
export function formatPakistaniPhoneNumber(phone?: string | null): string {
  if (!isValidContactNumber(phone)) return '';
  const digits = (phone || '').replace(/\D/g, '');
  
  let standard11 = digits;
  if (digits.startsWith('92') && digits.length === 12) {
    standard11 = '0' + digits.slice(2);
  } else if (digits.startsWith('0092') && digits.length === 14) {
    standard11 = '0' + digits.slice(4);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    standard11 = '0' + digits;
  }

  if (standard11.length === 11 && standard11.startsWith('03')) {
    return `${standard11.slice(0, 4)} ${standard11.slice(4)}`;
  }

  return phone?.trim() || standard11;
}
