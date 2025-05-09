## Backend TODOs

- [x] Registration
- [x] Log in
- [x] Log out
- [x] Forgot password
- [x] Verify email
- [x] Refresh token endpoint
- [x] HTTP-only cookie
- [x] CSRF protection
- [x] Rate limiting
- [x] Change password
- [x] Authorization
  - [x] Separate public and protected routes
  - [x] Create protected route examples
  - [x] Create authorization middleware to verify tokens on protected routes
  - [x] Add token validation checks (expiration, signature, etc.)
  - [x] Implement proper error responses for authorization failures (401/403)
  - [x] Add documentation for token usage in API responses
- [x] Row level security (RLS)
- [x] Delete account, profile, and oauth connections

OAuth Providers Support

- [x] Google OAuth2.0
- [x] GitHub OAuth2.0
- [ ] Apple OAuth2.0

Other Auth Methods

- [ ] Passkey (WebAuthn, FIDO2, etc.)
- [ ] Passwordless
  - [ ] Magic Link
  - [ ] OTP from email

Bonus

- [ ] Add role-based access control (RBAC) for different user types
- [ ] Create token denylist/revocation system

## Frontend TODOs

- [x] Create a basic public page
- [x] Create a basic registration UI
- [x] Create a basic login UI
- [x] Create a basic protected page
- [x] Add auth protection to the protected page
- [x] Implement a way to refresh the access token
- [x] Implement a way to revoke the refresh token (This is handled by cookie expiration and the refresh token being http-only)
- [x] Implement a way to check if the user is authenticated
- [x] Implement a way to logout the user
- [x] Eslint
- [ ] Create a basic user management UI
  - [x] User profile page
    - [x] User profile picture support
    - [x] User name support
    - [x] User bio support
  - [x] Change password page
  - [ ] 2FA page
  - [ ] Connected accounts page (social logins)
    - [ ] Link/unlink social accounts
  - [x] User preferences page
    - [x] User settings
    - [x] User notification preferences
  - [x] Delete account page

## Testing

- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add e2e tests
