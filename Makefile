# ============================================================================
#  Case Sphere SOC Platform — Makefile
#  Daily operations for native Linux installation
#  Usage: sudo make <target>
# ============================================================================

APP_DIR  := /opt/casesphere
APP_USER := casesphere
DB_NAME  := casesphere
BINARY   := $(APP_DIR)/casesphere-server

.PHONY: help start stop restart status logs health \
        backup restore db-shell reset-mfa update prune uninstall

help:
	@echo ""
	@echo "  Case Sphere — Available Commands"
	@echo "  ─────────────────────────────────────────────"
	@echo "  make start              Start application"
	@echo "  make stop               Stop application"
	@echo "  make restart            Restart application"
	@echo "  make status             Show all services status"
	@echo "  make health             Check /api/health endpoint"
	@echo "  make logs               Live application logs"
	@echo ""
	@echo "  make backup             Backup database"
	@echo "  make restore FILE=...   Restore database"
	@echo "  make db-shell           Open psql shell"
	@echo ""
	@echo "  make reset-mfa EMAIL=user@example.com"
	@echo "  make update FILE=/path/to/new/casesphere-server"
	@echo "  make prune              Clean old logs/backups (30d+)"
	@echo "  make uninstall          Remove everything"
	@echo ""

start:
	@systemctl start casesphere && systemctl start nginx
	@echo "[✓] Case Sphere started"
	@$(MAKE) status

stop:
	@systemctl stop casesphere
	@echo "[✓] Case Sphere stopped (Nginx still running)"

restart:
	@systemctl restart casesphere && systemctl reload nginx
	@echo "[✓] Restarted"
	@$(MAKE) status

status:
	@echo ""
	@printf "  casesphere : "; systemctl is-active casesphere 2>/dev/null || echo "inactive"
	@printf "  nginx      : "; systemctl is-active nginx 2>/dev/null || echo "inactive"
	@printf "  postgresql : "; systemctl is-active postgresql 2>/dev/null || echo "inactive"
	@echo ""
	@echo "  Memory usage:"
	@ps aux | grep casesphere-server | grep -v grep | awk '{print "  RSS: " $$6/1024 " MB | CPU: " $$3 "%"}' || echo "  (not running)"
	@echo ""

health:
	@curl -s http://localhost/api/health | python3 -m json.tool 2>/dev/null || \
	  curl -s http://localhost/api/health || echo "[✗] Not responding"

logs:
	@journalctl -u casesphere -f --no-pager

backup:
	@mkdir -p $(APP_DIR)/backups
	@FILE="$(APP_DIR)/backups/casesphere_$$(date +%Y%m%d_%H%M%S).sql"; \
	  sudo -u postgres pg_dump $(DB_NAME) > "$$FILE" && \
	  echo "[✓] Backup: $$FILE ($$(du -sh $$FILE | cut -f1))"

restore:
	@[ -n "$(FILE)" ] || { echo "[✗] Usage: make restore FILE=backups/file.sql"; exit 1; }
	@[ -f "$(FILE)" ] || { echo "[✗] Not found: $(FILE)"; exit 1; }
	@read -r -p "[!] This will OVERWRITE the database. Type 'yes' to confirm: " C; \
	  [ "$$C" = "yes" ] || { echo "Cancelled."; exit 0; }
	systemctl stop casesphere
	sudo -u postgres psql $(DB_NAME) < $(FILE)
	systemctl start casesphere
	@echo "[✓] Restore complete"

db-shell:
	@sudo -u postgres psql $(DB_NAME)

reset-mfa:
	@[ -n "$(EMAIL)" ] || { echo "[✗] Usage: make reset-mfa EMAIL=user@email.com"; exit 1; }
	@sudo -u postgres psql $(DB_NAME) \
	  -c "UPDATE users SET mfa_enabled=false, mfa_secret=NULL, mfa_backup_codes=NULL WHERE email='$(EMAIL)';" \
	  -c "SELECT email, mfa_enabled FROM users WHERE email='$(EMAIL)';"
	@echo "[✓] MFA reset for $(EMAIL) — will prompt re-setup on next login"

update:
	@[ -n "$(FILE)" ] || { echo "[✗] Usage: make update FILE=/path/to/casesphere-server"; exit 1; }
	@[ -f "$(FILE)" ] || { echo "[✗] Binary not found: $(FILE)"; exit 1; }
	@echo "[→] Backing up database before update..."
	@$(MAKE) backup
	@echo "[→] Replacing binary..."
	systemctl stop casesphere
	cp $(FILE) $(BINARY)
	chmod 750 $(BINARY)
	chown root:$(APP_USER) $(BINARY)
	systemctl start casesphere
	@sleep 3 && $(MAKE) health
	@echo "[✓] Update complete"

prune:
	@find $(APP_DIR)/logs -name "*.log" -mtime +30 -delete 2>/dev/null || true
	@find $(APP_DIR)/backups -name "*.sql" -mtime +30 -delete 2>/dev/null || true
	@journalctl --vacuum-time=30d 2>/dev/null || true
	@echo "[✓] Cleaned logs and backups older than 30 days"

uninstall:
	@echo "[!] WARNING: This permanently deletes all Case Sphere data!"
	@read -r -p "    Type 'DELETE EVERYTHING' to confirm: " C; \
	  [ "$$C" = "DELETE EVERYTHING" ] || { echo "Cancelled."; exit 0; }
	@echo "[→] Final backup..."
	-sudo -u postgres pg_dump $(DB_NAME) > "/tmp/casesphere_final_$$(date +%Y%m%d).sql" 2>/dev/null
	@echo "[→] Stopping and removing service..."
	-systemctl stop casesphere 2>/dev/null
	-systemctl disable casesphere 2>/dev/null
	-rm -f /etc/systemd/system/casesphere.service
	-systemctl daemon-reload
	@echo "[→] Removing Nginx config..."
	-rm -f /etc/nginx/sites-enabled/casesphere
	-rm -f /etc/nginx/sites-available/casesphere
	-systemctl reload nginx
	@echo "[→] Dropping database..."
	-sudo -u postgres psql -c "DROP DATABASE IF EXISTS casesphere;"
	-sudo -u postgres psql -c "DROP ROLE IF EXISTS cs_app;"
	-sudo -u postgres psql -c "DROP ROLE IF EXISTS cs_migrate;"
	@echo "[→] Removing files..."
	-rm -rf $(APP_DIR)
	-userdel $(APP_USER) 2>/dev/null
	@echo "[✓] Case Sphere completely removed"
	@echo "    Final backup at: /tmp/casesphere_final_$$(date +%Y%m%d).sql"
