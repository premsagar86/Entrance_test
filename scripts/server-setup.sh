#!/usr/bin/env bash
# One-time hardening + Docker install for a fresh Ubuntu 22.04/24.04 VPS. Run as root:
#   curl -fsSL <raw url> | sudo bash     (or copy it over and: sudo bash server-setup.sh)
# Review before running. After it finishes, add your SSH public key to /home/deploy/.ssh/authorized_keys
# BEFORE logging out, and confirm you can log in as `deploy` in a second terminal.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }

apt-get update && apt-get -y upgrade
apt-get install -y ufw fail2ban unattended-upgrades git curl

# Docker engine + compose plugin
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
JSON
systemctl restart docker

# deploy user
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

# app + backup dirs
install -d -o deploy -g deploy /opt/aptitude /var/backups/aptitude

# swap (2 GB) if none
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# SSH: key-only (only once a key is in place, so you don't lock yourself out)
if [ -s /home/deploy/.ssh/authorized_keys ]; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  systemctl reload ssh || systemctl reload sshd
else
  echo "NOTE: add an SSH key for 'deploy', then re-run to disable password/root login."
fi

systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
echo "Done. Next: clone the repo into /opt/aptitude as deploy, create .env (see DEPLOY.md)."
