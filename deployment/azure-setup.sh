#!/bin/bash

# ==============================================================================
# Azure Provisioning & Deployment Setup Script
# ==============================================================================
# This script guides you through setting up an Azure Virtual Machine and
# bootstrapping the complete proctoring & AI interview system.
# Run this script on your local machine to provision the Azure VM, or copy the
# bootstrap steps to run them directly on the remote VM.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Configurable Variables
RESOURCE_GROUP="smart-platform-rg"
LOCATION="eastus"
VM_NAME="smart-proctor-vm"
VM_SIZE="Standard_D2s_v5" # 2 vCPUs, 8GB RAM (recommended minimum for Judge0 & relays)
ADMIN_USERNAME="azureuser"
SSH_KEY_PATH="~/.ssh/id_rsa"

echo "=================================================="
echo "🚀 1. Provisioning Azure Infrastructure"
echo "=================================================="

# 1. Log in to Azure (uncomment if running first time)
# echo "Logging in to Azure..."
# az login

# 2. Create Resource Group
echo "Creating resource group: $RESOURCE_GROUP in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# 3. Create Ubuntu VM
echo "Creating Ubuntu VM: $VM_NAME ($VM_SIZE)..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image "Ubuntu2204" \
  --admin-username "$ADMIN_USERNAME" \
  --generate-ssh-keys \
  --ssh-key-values "$SSH_KEY_PATH" \
  --size "$VM_SIZE" \
  --public-ip-sku "Standard"

# 4. Open Network Ports (Ports 80/HTTP and 443/HTTPS for Nginx Proxy)
echo "Opening port 80 (HTTP) on NSG..."
az vm open-port --port 80 --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --priority 100

echo "Opening port 443 (HTTPS) on NSG..."
az vm open-port --port 443 --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --priority 110

# Get Public IP address
PUBLIC_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv)

echo "=================================================="
echo "✅ VM successfully provisioned!"
echo "   Public IP Address: $PUBLIC_IP"
echo "   SSH Command: ssh $ADMIN_USERNAME@$PUBLIC_IP"
echo "=================================================="
echo ""
echo "=================================================="
echo "🚀 2. Remote Bootstrap Script"
echo "=================================================="
echo "Connect to the VM and run these commands to install Docker and launch the services:"
echo ""

cat << 'EOF'

# --- START OF BOOTSTRAP COMMANDS TO RUN ON VM ---

# 1. Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Docker
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 3. Allow current user to run Docker commands without sudo
sudo usermod -aG docker $USER
newgrp docker # Activate group change immediately

# 4. Enable Docker service on boot
sudo systemctl enable docker
sudo systemctl start docker

# 5. Clone the repository and navigate to deployment folder
git clone https://github.com/your-org/your-repo.git system-deploy
cd system-deploy/deployment

# 6. Create production environment configurations
cat > .env << 'ENV_EOF'
# Database passwords
DB_USER=postgres
DB_PASSWORD=production_super_secure_pg_pass_2026

# SMART Coding backend configuration
JWT_SECRET=production_jwt_token_signing_secret_key_change_me
SMART_SSO_SECRET=cgpms_jwt_secret_2026_super_secure
CODING_PUBLIC_API_URL=http://your-exam-domain-or-ip.com/api

# Aural-OSS configuration
AURAL_APP_URL=http://your-aural-domain-or-ip.com
OPENAI_API_KEY=sk-proj-... # Set your OpenAI key
NEXT_PUBLIC_VOICE_RELAY_URL=ws://your-aural-domain-or-ip.com/voice-relay
NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL=ws://your-aural-domain-or-ip.com/openai-voice-relay

# (Optional) Supabase integration details
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=

# (Optional) Volcengine Doubao speech relays
# DOUBAO_APP_ID=
# DOUBAO_ACCESS_TOKEN=
# DOUBAO_SECRET_KEY=
# DOUBAO_APP_KEY=
# DOUBAO_RESOURCE_ID=
ENV_EOF

# 7. Make db-init script executable
chmod +x db-init.sh

# 8. Start the production stack
docker compose -f docker-compose.prod.yml up -d --build

echo "✅ Deployment complete! Check container status with: docker compose -f docker-compose.prod.yml ps"

# --- END OF BOOTSTRAP COMMANDS ---

EOF
