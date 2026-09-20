# Contributing

Thank you for your interest in contributing to smart-pill!

## Quick Start

```bash
npm install
npm run build
npm test
```

## Development Workflow

1. Fork the repository and create a feature branch.
2. Make your changes following the code style guidelines.
3. Add tests for any new functionality.
4. Ensure all checks pass before committing.
5. Open a pull request against `main`.

## Code Style

- Use **Prettier** for formatting: `npm run format`
- TypeScript strict mode is enforced: `npm run typecheck`
- Follow the existing module structure under `src/`

## Testing

We use **Vitest** for testing.

```bash
npm test              # Run tests
npm run test:coverage # Run tests with coverage
```

Write tests in `src/__tests__/` following the naming convention `*.test.ts`.

## Commit Convention

Commits should follow the conventional commits format:

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Pull Request Process

1. Ensure all CI checks pass (typecheck, test, lint).
2. Update documentation if your change affects public APIs.
3. Link any related issues in the PR description.
4. Fill out the PR checklist before requesting review.
