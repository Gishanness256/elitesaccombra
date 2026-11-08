# Database Seed and Migration Notes

## Development-only seed files

Use seed scripts only in non-production environments.

- Do not run seed files in production.
- Keep SQL files idempotent where possible.
- Never commit real credentials or production tokens to the repository.
- If you need a seed script for a shared team environment, prefer anonymized fixtures.

Example guard for a development-only seed:

```sql
DO $$
BEGIN
  IF current_setting('app.environment', true) IS DISTINCT FROM 'development' THEN
    RAISE EXCEPTION 'Refusing to run development seed data outside development.';
  END IF;
END
$$;