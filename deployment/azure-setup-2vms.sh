#!/bin/bash

# ==============================================================================
# Azure Provisioning & Deployment Setup Script (2 VMs + Cloud DB)
# ==============================================================================
# This script guides you through deploying Aural-OSS and SMART Coding Platform
# on two separate Azure VMs, connecting both to an external cloud database.
# ==============================================================================

set -e

# Configurable Variables
RESOURCE_GROUP="smart-platform-rg"
LOCATION="eastus"
VM_SIZE="Standard_D2s_v5" # 2 vCPUs, 8GB RAM (recommended minimum for VM 2 Judge0 / workers)
ADMIN_USERNAME="azureuser"
SSH_KEY_PATH="~/.ssh/id_rsa"

# VM Names
AURAL_VM="smart-aural-vm"
CODING_VM="smart-coding-vm"

echo "=================================================="
echo "🚀 1. Provisioning Azure VMs"
echo "=================================================="

# 1. Create Resource Group
echo "Creating resource group: $RESOURCE_GROUP..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# 2. Create Aural OSS VM (VM 1)
echo "Creating VM: $AURAL_VM..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AURAL_VM" \
  --image "Ubuntu2204" \
  --admin-username "$ADMIN_USERNAME" \
  --generate-ssh-keys \
  --ssh-key-values "$SSH_KEY_PATH" \
  --size "Standard_B2s" # Aural-OSS can run fine on 2 vCPUs / 4GB RAM

# 3. Create Coding Platform VM (VM 2)
echo "Creating VM: $CODING_VM..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CODING_VM" \
  --image "Ubuntu2204" \
  --admin-username "$ADMIN_USERNAME" \
  --generate-ssh-keys \
  --ssh-key-values "$SSH_KEY_PATH" \
  --size "$VM_SIZE" # Judge0 compiler requires cgroups & 8GB RAM

# 4. Open Network Ports (Ports 80/443 for both VMs)
echo "Opening web ports on Aural VM..."
az vm open-port --port 80 --resource-group "$RESOURCE_GROUP" --name "$AURAL_VM" --priority 100
az vm open-port --port 443 --resource-group "$RESOURCE_GROUP" --name "$AURAL_VM" --priority 110

echo "Opening web ports on Coding VM..."
az vm open-port --port 80 --resource-group "$RESOURCE_GROUP" --name "$CODING_VM" --priority 100
az vm open-port --port 443 --resource-group "$RESOURCE_GROUP" --name "$CODING_VM" --priority 110

# Fetch Public IPs
AURAL_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$AURAL_VM" --query publicIps -o tsv)
CODING_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$CODING_VM" --query publicIps -o tsv)

echo "=================================================="
echo "✅ Infrastructure Provisioned!"
echo "   AURAL VM IP: $AURAL_IP (SSH: ssh $ADMIN_USERNAME@$AURAL_IP)"
echo "   CODING VM IP: $CODING_IP (SSH: ssh $ADMIN_USERNAME@$CODING_IP)"
echo "=================================================="
echo ""
echo "Follow the VM-specific bootstrap steps below to complete the deployment."
echo ""

# ==============================================================================
# VM 1: AURAL-OSS SETUP
# ==============================================================================
cat << AURAL_BOOTSTRAP_EOF
================================================================================
🖥️  VM 1 SETUP: AURAL-OSS ($AURAL_IP)
================================================================================
1. SSH into the VM:
   ssh azureuser@$AURAL_IP

2. Run Docker installer commands:
   sudo apt-get update && sudo apt-get upgrade -y
   sudo apt-get install -y ca-certificates curl gnupg lsb-release
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
   sudo usermod -aG docker \$USER && newgrp docker

3. Clone the repo and navigate to aural deployment folder:
   git clone <YOUR_REPO_URL> system-deploy
   cd system-deploy/deployment/aural-vm

4. Configure Aural production environment:
   cat > .env << ENV_EOF
   # Database connection to your Cloud DB (Aural schema will be created/used here)
   DATABASE_URL=postgresql://<CLOUD_DB_USER>:<CLOUD_DB_PASSWORD>@<CLOUD_DB_HOST>:<PORT>/aural

   # Aural Application details
   AURAL_APP_URL=http://$AURAL_IP
   NEXT_PUBLIC_VOICE_RELAY_URL=ws://$AURAL_IP/voice-relay
   NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL=ws://$AURAL_IP/openai-voice-relay

   # AI integration credentials
   OPENAI_API_KEY=sk-proj-xxxxxx
   ENV_EOF

5. Start Aural:
   docker compose up -d --build

AURAL_BOOTSTRAP_EOF

# ==============================================================================
# VM 2: SMART CODING PLATFORM SETUP
# ==============================================================================
cat << CODING_BOOTSTRAP_EOF
================================================================================
🖥️  VM 2 SETUP: SMART CODING PLATFORM ($CODING_IP)
================================================================================
1. SSH into the VM:
   ssh azureuser@$CODING_IP

2. Run Docker installer commands:
   sudo apt-get update && sudo apt-get upgrade -y
   sudo apt-get install -y ca-certificates curl gnupg lsb-release
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
   sudo usermod -aG docker \$USER && newgrp docker

3. Clone the repo and navigate to coding deployment folder:
   git clone <YOUR_REPO_URL> system-deploy
   cd system-deploy/deployment/coding-vm

4. Configure Coding Platform environment:
   cat > .env << ENV_EOF
   # Connection string directly pointing to your Cloud DB
   # Note: The backend will automatically apply tables/migrations to this database on startup!
   DATABASE_URL=postgresql://<CLOUD_DB_USER>:<CLOUD_DB_PASSWORD>@<CLOUD_DB_HOST>:<PORT>/coding_platform

   # Web configuration
   CODING_PUBLIC_API_URL=http://$CODING_IP/api
   JWT_SECRET=production_jwt_signing_secret_key_change_me
   SMART_SSO_SECRET=cgpms_jwt_secret_2026_super_secure

   # Connection to the Aural OSS Bridge (running on VM 1)
   AURAL_OSS_BRIDGE_URL=http://$AURAL_IP/api/exam-bridge
   AURAL_OSS_SERVICE_KEY=cp-bridge-de53f7288acfac071fdf8298d67f597cab0e3f6b951678f2
   ENV_EOF

5. Start the Coding Platform & Compiler sandbox:
   docker compose up -d --build

CODING_BOOTSTRAP_EOF
