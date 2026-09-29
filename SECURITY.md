# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Active |

---

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security
issue in Case Sphere FREE, please follow responsible disclosure practices.

### ⚠️ Do NOT report security vulnerabilities through public GitHub issues.

### How to Report

Please send your report via email to:

📧 **security@casesphere.io**

Include the following in your report:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** (data exposure, authentication bypass, etc.)
- **Suggested fix** (if you have one)
- Your **name/handle** for acknowledgement (optional)

### What to Expect

| Timeline | Action |
|----------|--------|
| Within 48 hours | We acknowledge receipt of your report |
| Within 7 days | We assess severity and confirm the vulnerability |
| Within 30 days | We release a fix (critical issues may be faster) |
| After fix | We notify you and credit your discovery (if desired) |

---

## Security Scope

### In Scope
- Authentication bypass
- SQL injection
- Remote code execution
- Privilege escalation
- Sensitive data exposure
- Cross-site scripting (XSS)
- API key exposure

### Out of Scope
- Vulnerabilities in third-party dependencies (report directly to them)
- Issues requiring physical access to the server
- Social engineering attacks
- Denial of service (DoS) attacks
- Issues in outdated/unsupported versions

---

## Security Features in Case Sphere FREE

- JWT-based authentication (access + refresh tokens)
- Rate limiting on authentication endpoints
- HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- Input validation and parameterized queries
- Audit logging for all security-relevant events
- UFW firewall configuration

> 🔒 **Need MFA and enhanced security?** Upgrade to [Case Sphere Pro](mailto:sales@casesphere.io)
