<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Chatslock — Agent Guide

Chatslock is a chat application where users and agents communicate through conversations. The product includes account management, support workflows, moderation, and administrative controls.

The repository is a TypeScript pnpm + Turborepo monorepo. The mobile client is built with Expo / React Native; backend APIs use Hono on AWS Lambda; authentication uses Amazon Cognito; infrastructure is managed with Terraform under `infrastructure/`.

## Product model and access rules

Understand these product roles before changing chat, account, or authorization behavior.

- **User:** Uses the app, manages their own permitted account details, and participates in conversations with agents and other participants where the product allows it.
- **Agent:** Communicates with users and handles conversations assigned or made available to them according to the existing support workflow. Do not assume an agent can access every conversation.
- **Moderator:** Has broad moderation access to users' accounts and conversations, including viewing conversations across users when needed for moderation. Moderator capabilities are broader than normal user and agent capabilities, but do not include creating or promoting other moderators unless the existing policy explicitly says otherwise.
- **Admin:** Has full administrative access, including managing accounts and conversations, and creating or assigning moderators.

### Authorization rules

- Enforce authorization on the backend. Mobile UI guards are for user experience and are not security controls.
- A user must not be able to edit, delete, or manage another user's content merely by changing a request ID.
- Agents must follow the application's conversation assignment and support rules; do not infer global access from the `agent` role.
- Moderators may inspect and manage accounts and conversations across users according to the moderation policy.
- Only admins may create moderators or grant the moderator role.
- Admins can perform all application administration actions.
- Check both the caller's role/permission and resource-specific conditions where relevant, such as message ownership, conversation membership, assignment, account status, or action type.
- Deny access by default when the policy does not explicitly allow an action.
- Never trust role, user ID, ownership, or permissions sent in a request body or arbitrary client-controlled header.
- Keep authorization checks centralized in shared middleware and policy/service functions. Do not copy role-checking logic into many controllers.
- If roles or permissions are represented in token claims, use only claims validated by the configured API Gateway/Cognito authentication path. Account for stale claims and revocation requirements.
- Protect moderator/admin actions from accidental or unauthorized privilege escalation. Log sensitive administrative actions using the existing audit/logging approach where available.

## Repository map

| Path                                                   | Package         | What it is                                                                                                  |
| ------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/chat`                                            | `chat`          | Expo / React Native app (Expo Router, iOS + Android + web)                                                  |
| `apps/main-site`                                       | `main-site`     | Vite + React marketing site                                                                                 |
| `packages/api`                                         | `@repo/api`     | Server-side shared core: data-access code, Zod schemas, auth/response middleware, and domain types          |
| `packages/utils`                                       | `@repo/utils`   | Client-side shared core: axios client, token manager, auth services, JWT helpers                            |
| `packages/ui`                                          | `@repo/ui`      | Design tokens and shared React Native components                                                            |
| `packages/eslint-config`, `packages/typescript-config` |                 | Shared lint/TypeScript configurations                                                                       |
| `functions/auth`                                       | `auth`          | Lambda for authentication endpoints such as OTP, login, refresh, logout, and administrative user operations |
| `functions/users`                                      | `users`         | Lambda for user endpoints such as `GET /api/users/me` and onboarding                                        |
| `functions/conversations`                              | `conversations` | Lambda for conversation endpoints                                                                           |
| `infrastructure`                                       |                 | Terraform for Cognito, API Gateway, Lambda, storage, database resources, and the static site                |
| `layers/api`                                           |                 | Generated Lambda layer archive; do not edit by hand                                                         |
| `scripts`                                              |                 | Build/deployment scripts                                                                                    |

Rule of thumb: code shared by an app and a Lambda belongs in an appropriate `@repo/*` package instead of being duplicated. Mobile-only code stays in `apps/chat/src`; Lambda-specific code stays in `functions/<name>/src`.

Inspect the repository before assuming a path, package, route, resource, or feature exists. This guide describes established conventions, not permission to restructure the repository.

## Commands

Run commands from the repository root unless a command says otherwise.

```bash
pnpm install
pnpm build
pnpm check-types
pnpm lint
pnpm dev

# Targeted builds
pnpm turbo run build --filter=@repo/api --filter=conversations

# Layer and infrastructure workflows
pnpm layer:build
pnpm infra:plan
pnpm infra:apply
pnpm deploy
```

Inspect the root `package.json` and workspace scripts if a command is missing or has changed. There is currently no test runner configured; use type checking, linting, and targeted builds, and report that limitation accurately.

### Mobile app

```bash
cd apps/chat
npx expo install <pkg>
npx expo start
npx expo run:android
npx expo lint
npx tsc --noEmit
```

Always use `npx expo install` for Expo / React Native dependencies so the installed Expo SDK's compatible versions are selected. Native modules require an appropriate development build and may not work in Expo Go.

Read `apps/chat/AGENTS.md` before changing the mobile app. Expo APIs vary by SDK version; inspect the installed Expo version and consult matching documentation rather than relying on memory.

## Backend conventions

- Backend APIs use Hono on AWS Lambda and are mounted through API Gateway. Follow the existing route and deployment configuration rather than assuming every function uses an identical route pattern.
- Keep layering strict: `index.ts` defines routes; `*.controller.ts` reads validated input and request context, calls the service, and formats the result; `*.service.ts` implements business logic and error mapping; shared data-access code is used for persistence.
- Controllers must not access the data-access layer directly. Services must not construct HTTP responses.
- Zod schemas live in `packages/api/src/schema`, extend the existing base schema conventions, and are exported through the package's supported subpaths. Validation middleware places parsed input in the established Hono context key. Follow nearby implementations.
- Successful responses use the established response middleware and response envelope. Use the project's `ApiException` convention for errors clients need to handle explicitly; use generic HTTP exceptions only where appropriate.
- The existing `withAuth` middleware reads Cognito claims from the API Gateway request context and sets `userId` (`sub`) and `cognitoUsername`. Reuse this context instead of reparsing the token in each controller.
- Do not assume a context key, adapter API, middleware order, or response shape; inspect the installed code and nearby functions.
- Log unexpected server errors using the existing conventions, but never expose internal errors or secrets to clients.

### Shared package builds

`@repo/api` is prebuilt and Lambda consumers may resolve its `dist/` output. After editing `packages/api`, rebuild it before checking dependent functions:

```bash
pnpm turbo run build --filter=@repo/api
```

A targeted function build should include its dependencies where the Turbo configuration supports it. The package exports subpaths (currently including schema, utilities, types, and data-access modules); inspect `package.json` and `tsup.config.ts` before adding a new public entry point.

## Conversation and messaging behavior

- Users and agents communicate through conversations. Preserve the product's existing rules for conversation creation, participation, assignment, visibility, and closure.
- Do not assume every agent can access every conversation; use the existing assignment and authorization rules.
- Moderators can access conversations across users for moderation and can inspect user accounts within their moderation authority.
- Admins can access and administer all conversations and accounts.
- Enforce authorization for every operation that reads or mutates sensitive conversation or account data, not only for UI navigation.
- For message edits/deletions, check the actor's role and the message/conversation policy. Ownership alone does not override moderator/admin policy, and a privileged role should not bypass unrelated business constraints unless the product rules explicitly allow it.
- Treat retries, duplicate requests, concurrent sends, ordering, read receipts, unread counts, and conversation previews as correctness concerns. Follow the existing implementation and avoid introducing incompatible semantics.
- Keep realtime delivery and durable message persistence conceptually separate. Do not assume that publishing an event proves that it was persisted or delivered.

## Client-side shared package (`packages/utils`)

The shared client package includes the existing API client, token manager, authentication services, refresh helpers, auth events, secure storage, and JWT utilities. It may be prebuilt like `@repo/api`; inspect package scripts and consumer resolution before editing, and rebuild it when required.

- Mobile API calls must go through `apps/chat/src/api/client.ts` and the shared client conventions. Do not call `fetch` or `axios` directly from screens.
- The shared client attaches the access token and handles the established refresh-and-retry flow. Preserve that behavior unless intentionally changing authentication.
- The API base URL is configured through `EXPO_PUBLIC_API_URL` and the existing API configuration helper.

## Mobile app conventions (`apps/chat`)

- Expo Router uses `src/app/` as the route tree. `_layout.tsx` files define navigators and protected-route guards. Keep non-route code outside the route tree in the existing component, utility, and API directories.
- `src/utils/AuthContext.tsx` owns the client session. Inspect its current API before relying on particular `useAuth()` or `useCurrentUser()` fields.
- Authentication state should not be marked complete before the required user profile/session initialization has completed.
- Import shared components and design tokens from `@repo/ui`. Use the existing theme tokens for spacing, radius, sizing, and colors rather than hard-coded values.
- Use the established toast provider instead of introducing another toast library.
- Use the `@/` path alias for `src` where configured.
- Keep concise doc comments above exported components/hooks when they explain why the abstraction exists.
- Do not change unrelated app screens while implementing a backend-only task.

## Infrastructure conventions

- Terraform lives under `infrastructure/`, with modules organized by service. Inspect the current layout before changing resources.
- Keep resource names, environment variables, IAM references, and application configuration consistent across the code and infrastructure.
- Use least-privilege IAM policies. Avoid wildcard permissions when a narrower policy can satisfy the requirement.
- Keep private resources private and grant network access only when required by the workload.
- Use VPC endpoints where appropriate for private access to supported AWS services; do not assume that a public subnet gives a Lambda function internet access.
- Treat Terraform plans as potentially destructive. Review replacements, deletions, policy changes, and data-loss risks before applying.
- Never run production applies, destructive operations, or deployments without explicit authorization.
- Never commit secrets, `.env` files, Terraform state (`*.tfstate*`), credentials, or generated `layers/` output.

## Dependencies, validation, and code changes

- Inspect neighboring files, package scripts, imports, types, and tests before editing.
- Keep changes within the requested scope. Avoid opportunistic refactoring.
- Reuse existing dependencies and patterns; do not add a dependency unless it materially improves the implementation.
- Preserve public API contracts unless a breaking change is explicitly requested.
- Update shared schemas and types when API contracts change.
- Run relevant checks: `pnpm check-types`, `pnpm lint`, and a targeted build for affected workspaces.
- There is no test runner configured at the time this guide was written. Do not claim tests passed unless tests were actually run.
- Report pre-existing failures separately from failures introduced by the change.
- Review the complete diff before declaring the work finished.

## Working rules for agents

1. Read relevant files and nearby implementations before writing code.
2. Verify actual repository paths, package scripts, dependency versions, and infrastructure configuration instead of guessing.
3. Keep changes focused and explain any important assumptions.
4. Do not start or kill long-running development servers that the user may already be using, especially Expo or Vite servers.
5. Do not commit unless explicitly asked.
6. Never commit secrets, state files, generated build artifacts, or deployment credentials.
7. Write comments only when they explain non-obvious reasoning; avoid change-log comments.
8. Never claim code was deployed, infrastructure was applied, or checks passed unless the action actually occurred.
