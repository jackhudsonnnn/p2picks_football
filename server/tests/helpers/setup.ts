/**
 * Test Setup
 *
 * Global setup that runs before each test file.
 * Configures environment and mocks for testing.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.REDIS_URL = 'redis://localhost:6379';

// Suppress console output in tests (optional - comment out for debugging)
// console.log = () => {};
// console.info = () => {};
// console.warn = () => {};
// console.debug = () => {};
