/**
 * UUID Validation and Sanitization Utilities
 * Handles invalid UUID inputs gracefully
 */

/**
 * Validates if a string is a valid UUID format
 * @param value - String to validate
 * @returns true if valid UUID, false otherwise
 */
export function isValidUUID(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Sanitizes a UUID value - returns null if invalid
 * @param value - String to sanitize
 * @returns Valid UUID string or null
 */
export function sanitizeUUID(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmed = value.trim();

  // Check if it's a valid UUID
  if (isValidUUID(trimmed)) {
    return trimmed.toLowerCase();
  }

  // If it's a numeric string (like "1", "2"), it's invalid
  if (/^\d+$/.test(trimmed)) {
    console.warn(`[UUID_VALIDATOR] Invalid UUID format detected (numeric): "${trimmed}"`);
    return null;
  }

  // If it's empty or just whitespace
  if (trimmed.length === 0) {
    return null;
  }

  // Log warning for other invalid formats
  console.warn(`[UUID_VALIDATOR] Invalid UUID format: "${trimmed}"`);
  return null;
}

/**
 * Validates and sanitizes multiple UUID fields
 * @param fields - Object with UUID fields to validate
 * @returns Object with sanitized UUID fields (invalid ones set to null)
 */
export function sanitizeUUIDFields<T extends Record<string, any>>(
  fields: T,
  uuidFieldNames: string[]
): T {
  const sanitized = { ...fields };

  for (const fieldName of uuidFieldNames) {
    if (fieldName in sanitized) {
      const originalValue = sanitized[fieldName];
      const sanitizedValue = sanitizeUUID(originalValue);

      if (sanitizedValue === null && originalValue != null) {
        console.warn(
          `[UUID_VALIDATOR] Invalid UUID for field "${fieldName}": "${originalValue}". Setting to null.`
        );
      }

      sanitized[fieldName] = sanitizedValue;
    }
  }

  return sanitized;
}

/**
 * Validates required UUID field - throws error if invalid
 * @param value - UUID value to validate
 * @param fieldName - Name of the field (for error message)
 * @returns Valid UUID string
 * @throws Error if UUID is invalid
 */
export function validateRequiredUUID(value: string | null | undefined, fieldName: string): string {
  const sanitized = sanitizeUUID(value);

  if (!sanitized) {
    throw new Error(
      `Invalid UUID format for required field "${fieldName}": "${value}". Expected UUID format (e.g., "550e8400-e29b-41d4-a716-446655440000").`
    );
  }

  return sanitized;
}
