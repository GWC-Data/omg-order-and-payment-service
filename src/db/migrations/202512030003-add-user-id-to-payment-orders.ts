export async function up(): Promise<void> {
  // This migration is now handled by the first migration
  // Keeping it empty to avoid conflicts
  console.log('userId column migration is handled by the main migration file');
}

export async function down(): Promise<void> {
  // No-op since the column is handled by the main migration
}