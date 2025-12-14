# Agent Rules and Guidelines

## Test-Driven Development (TDD) Workflow

When implementing a new feature or fixing a bug, follow the Test-Driven Development (TDD) workflow:

1. **Write a failing test first**: Before writing any implementation code, write a test that describes the desired behavior. The test should fail initially because the feature doesn't exist yet or the bug fix isn't implemented.

2. **Verify the test fails**: Run the test suite to confirm the new test is failing for the expected reason. This ensures the test is actually testing the right thing.

   ```bash
   npm test
   ```

   To run a single test file:
   ```bash
   npm test -- path/to/your-test-file.test.ts
   ```
   
   Or using Jest directly:
   ```bash
   npx jest path/to/your-test-file.test.ts
   ```

3. **Iterate until green**: Write the minimum code necessary to make the test pass. Run the test suite frequently to verify progress:
   ```bash
   npm test
   ```
   
   For faster feedback during development, use watch mode:
   ```bash
   npm run test:watch
   ```

4. **Refactor while keeping tests green**: Once the test passes, refactor the code to improve its design, readability, and maintainability. After each refactoring step, rerun the test suite to ensure everything still passes:
   ```bash
   npm test
   ```

**Key Principles:**
- Never skip writing the test first
- Always verify the test fails before implementing
- Keep the test suite green throughout the refactoring phase
- Use single test file execution for faster feedback during development
- The test suite should be your safety net - if it's green, you haven't broken anything

