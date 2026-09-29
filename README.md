# Case Sphere FREE

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0-blue" />
  <img src="https://img.shields.io/badge/platform-Linux-lightgrey" />
  <img src="https://img.shields.io/badge/license-Proprietary%20Freeware-red" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791" />
  <img src="https://img.shields.io/badge/no%20Docker-required-success" />
</p>

**Case Sphere FREE** is a self-hosted SOC Case Management Platform designed
for security teams who need a complete incident investigation toolkit —
easy to deploy, no Docker or Node.js required.

---

## ⚡ Quick Install

```bash
wget https://github.com/shabrankhairi/casesphere-free/releases/download/v1.0/casesphere-free-v1.0-linux-x64.tar.gz
tar -xzf casesphere-free-v1.0-linux-x64.tar.gz
cd casesphere-free-v1.0-linux-x64
sudo ./install.sh
```

> **Requirements:** Ubuntu 22.04+ | 2GB RAM | 10GB disk | Internet access

The installer automatically sets up PostgreSQL 16, Nginx, systemd service,
and UFW firewall. No Node.js or Docker required.

---

## ✅ Features

| Feature | FREE | Pro |
|---------|:----:|:---:|
| Case management (CRUD, tasks, observables, timeline, comments) | ✅ | ✅ |
| SIEM integration (Splunk, Elastic, Wazuh, QRadar, Sentinel, Darktrace, CEF, LEEF) | ✅ | ✅ |
| VirusTotal IOC reputation check | ✅ | ✅ |
| MITRE ATT&CK tagging | ✅ | ✅ |
| SLA monitoring (TTR/TFR per severity) | ✅ | ✅ |
| Audit log | ✅ | ✅ |
| User management + role-based access control | ✅ | ✅ |
| API keys for SIEM integration | ✅ | ✅ |
| Evidence file attachments (max 20MB) | ✅ | ✅ |
| **MFA / Two-factor Authentication (TOTP)** | ❌ | ✅ |
| **Multi-tenancy / Organizations** | ❌ | ✅ |
| **AI Case Analysis (Claude API)** | ❌ | ✅ |
| **Generate Report** | ❌ | ✅ |

---

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 22.04 LTS |
| RAM | 2GB | 4GB |
| Disk | 10GB free | 20GB+ |
| Network | Internet (for install only) | — |
| Node.js | ❌ Not required | — |
| Docker | ❌ Not required | — |

---

## 🔐 Default Credentials

> ⚠️ **Change the admin password immediately after first login!**

| Field | Value |
|-------|-------|
| Email | `admin@casesphere.local` |
| Password | `Admin@1234!` |

---

## 📖 Daily Operations

```bash
sudo make help                              # Show all commands
sudo make status                            # Check service status
sudo make logs                              # View live logs
sudo make backup                            # Backup database
sudo make restore FILE=backups/file.sql     # Restore from backup
sudo make restart                           # Restart application
sudo make reset-mfa EMAIL=user@email.com    # Reset user MFA
sudo make update FILE=/path/to/binary       # Update to new version
sudo make uninstall                         # Remove everything
```

---

## 📦 Download

👉 **[Download Latest Release](https://github.com/shabrankhairi/casesphere-free/releases/latest)**

---

## 🔒 License

Case Sphere FREE is **proprietary freeware** — free to use, but not open source.
You may not modify, reverse engineer, or redistribute this software.

See [LICENSE](LICENSE) for full terms.

---

## 🛡️ Security

Found a vulnerability? Please read our [Security Policy](SECURITY.md)
before disclosing publicly.

---

## 🚀 Upgrade to Pro

Need **MFA**, **AI Case Analysis**, **Multi-tenancy**, or **Report Generation**?

📧 **[sales@casesphere.io](mailto:sales@casesphere.io)**
