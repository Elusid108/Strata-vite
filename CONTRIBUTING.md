# Contributing to Strata

Thank you for your interest in contributing to Strata! This document outlines the security requirements and development workflow for the project.

## Security Requirements

### git-secrets (Required)

This project uses [git-secrets](https://github.com/awslabs/git-secrets) to prevent accidental commits of API keys and sensitive credentials. You **must** install and configure it before making any commits.

#### Installation

**Windows (via Scoop):**

```bash
scoop install git-secrets
```

**macOS (via Homebrew):**

```bash
brew install git-secrets
```

**Linux (from source):**

```bash
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
sudo make install
```

#### Configuration

After cloning the repository, run these commands from the project root:

```bash
# Install git-secrets hooks into this repo
git secrets --install

# Register AWS patterns (covers common cloud credential formats)
git secrets --register-aws

# Add Google-specific patterns
git secrets --add 'AIza[0-9A-Za-z\-_]{35}'
git secrets --add '[0-9]+-[0-9a-z]+\.apps\.googleusercontent\.com'
```

#### Verification

Verify git-secrets is working:

```bash
# List registered patterns
git secrets --list

# Scan all files for secrets
git secrets --scan -r .
```

### Credential Handling Rules

- **Never** commit `.env` files containing real credentials
- **Never** hardcode API keys, tokens, or passwords in source code
- **Always** use environment variables via `import.meta.env` for sensitive configuration
- **Always** use `.env.example` as a template with placeholder values only
- If you need to add a new secret, update `.env.example` with a placeholder and document it in [SETUP.md](SETUP.md)

## Development Workflow

### Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Set up git-secrets (see above)
5. Configure your environment: `cp .env.example .env` and fill in credentials (see [SETUP.md](SETUP.md))
6. Start the dev server: `npm run dev`

### Branch Naming

Use descriptive branch names with a category prefix:

- `feature/` - New features (e.g., `feature/export-to-pdf`)
- `fix/` - Bug fixes (e.g., `fix/drive-sync-error`)
- `refactor/` - Code refactoring (e.g., `refactor/tree-operations`)
- `docs/` - Documentation updates (e.g., `docs/update-setup-guide`)

### Commit Messages

Write clear, descriptive commit messages:

- Use the imperative mood: "Add feature" not "Added feature"
- Keep the first line under 72 characters
- Reference issues when applicable: "Fix drive sync error (#42)"

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes and commit them
3. Ensure git-secrets scan passes: `git secrets --scan -r .`
4. Verify the app builds successfully: `npm run build`
5. Push your branch and open a pull request
6. Describe your changes and link any related issues
7. Wait for review and address any feedback

## Project Conventions

- **Components**: React functional components with hooks, placed in `src/components/`
- **Hooks**: Custom hooks in `src/hooks/`, prefixed with `use`
- **Utilities**: Helper functions in `src/lib/`
- **Styling**: Tailwind CSS utility classes; support both light and dark modes
- **Licensing**: All source files should include the Apache 2.0 license header
