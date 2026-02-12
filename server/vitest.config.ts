import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test directory
    include: ['tests/**/*.test.ts'],
    
    // Environment
    environment: 'node',
    
    // Global test timeout
    testTimeout: 10000,
    
    // Setup files (run before each test file)
    setupFiles: ['./tests/helpers/setup.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/**/*.d.ts',
        'src/data/**/*.json',
      ],
    },
    
    // Reporter
    reporters: ['verbose'],
    
    // Global variables
    globals: true,
  },
});
