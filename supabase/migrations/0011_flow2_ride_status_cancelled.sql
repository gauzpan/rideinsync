-- ============================================================================
-- Flow 2 — Add 'cancelled' to ride_status enum
-- ----------------------------------------------------------------------------
-- Postgres requires ALTER TYPE ... ADD VALUE to be committed before the new
-- enum value can be referenced in functions or policies in subsequent migrations.
-- ============================================================================

alter type ride_status add value if not exists 'cancelled';
