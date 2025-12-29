# Contributing to Zillions Core

Thank you for your interest in contributing to Zillions Core! We welcome contributions from the community to help make this the best Node.js trading bot engine.

## 🤝 Getting Started

1.  **Fork** the repository on GitHub.
2.  **Clone** your fork locally:
    ```bash
    git clone https://github.com/your-username/core.git
    cd core
    ```
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Create a Branch** for your feature or fix:
    ```bash
    git checkout -b feature/amazing-feature
    ```

## 🛠 Development Guidelines

### Code Style
- We use **TypeScript** in Strict Mode.
- We follow a **Hexagonal Architecture**. Please respect the boundaries between Core, Adapters, and Interfaces.
- Run linting before committing:
    ```bash
    npm run lint
    ```

### Testing
- All new features must include **Unit Tests**.
- Run the full test suite to ensure no regressions:
    ```bash
    npm test
    ```

### Commits
- Use clear, descriptive commit messages.
- We prefer the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat: add new strategy`, `fix: risk manager bug`).

## ⚖️ License & Attribution

By contributing, you agree that your code will be licensed under the **Apache License 2.0**.

**Important**: Per the project's NOTICE file, any derivative works or distributions must strictly maintain the attribution to **Zillions.app** and **@christonomous**.
