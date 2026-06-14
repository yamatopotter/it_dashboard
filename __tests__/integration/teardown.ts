export default async function globalTeardown() {
  // Nothing — test database persists between runs for inspection
  // Run `docker compose exec postgres psql -U it_dashboard -d it_dashboard_test -c "TRUNCATE ..."` to clean manually
}
