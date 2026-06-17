# Deployment Status & Topology: Aural-OSS & SMART Coding Platform

This document outlines where each service is deployed, how the network traffic is routed, and details the issues we have identified and resolved.

---

## 1. VM Topology & Infrastructure

We have provisioned **two separate Azure VMs** under the resource group `smart-platform-rg` in region `centralindia` (Standard_D2s_v3 / Standard_D2s_v5 sizes):

### VM 1: `smart-aural-vm` (Aural-OSS AI Interview Platform)
* **Public IP**: `4.224.31.8`
* **Private IP**: `10.0.0.4`
* **Public Endpoints**: Port `80` (HTTP redirects to HTTPS) and Port `443` (HTTPS with self-signed SSL).

### VM 2: `smart-coding-vm` (SMART Coding Platform & Compiler Sandbox)
* **Public IP**: `20.219.161.91`
* **Private IP**: `10.0.0.5`
* **Public Endpoints**: Port `80` (HTTP redirects to HTTPS) and Port `443` (HTTPS with self-signed SSL).

---

## 2. Container Topology & Port Allocation

### A. VM 1 (Aural-OSS) Containers
All services run inside Docker containers managed by `deployment/aural-vm/docker-compose.yml`:

| Container Name | Service Port (Internal) | Public Route (via Nginx) | Purpose |
| :--- | :--- | :--- | :--- |
| `aural-web-app` | `3000` | `https://4.224.31.8/` | Next.js client & Next API routes |
| `aural-voice-relay-doubao` | `8081` | `wss://4.224.31.8/voice-relay` | Speech-to-speech relay using Volcengine Doubao |
| `aural-voice-relay-azure` | `8082` | `wss://4.224.31.8/openai-voice-relay` | OpenAI Realtime WebSocket relay |
| `aural-voice-relay-azure-speech` | `8083` | `wss://4.224.31.8/azure-voice-relay` | Azure Speech Service / Sarvam AI relay |
| `aural-nginx` | `80` / `443` | N/A | Entrypoint reverse-proxy & SSL termination |

---

### B. VM 2 (SMART Coding) Containers
All services run inside Docker containers managed by `deployment/coding-vm/docker-compose.yml`:

| Container Name | Service Port (Internal) | Public Route (via Nginx) | Purpose |
| :--- | :--- | :--- | :--- |
| `coding-frontend-client` | `3001` | `https://20.219.161.91/` | Next.js frontend client |
| `coding-backend-api` | `5002` | `https://20.219.161.91/api` | Express backend REST API |
| `local-coding-redis` | `6379` | Internal Only | Session caching / rate limiting |
| `local-judge0-db` | `5432` | Internal Only | Postgres database dedicated for Judge0 sandbox |
| `local-judge0-sandbox` | `2358` | Internal Only | Judge0 compiler executor for testing student code |
| `coding-nginx` | `80` / `443` | N/A | Entrypoint reverse-proxy & SSL termination |

---

## 3. Issues & Resolutions Status

We diagnosed and resolved several critical connection and configuration issues during live deployment testing:

### ❌ Issue 1: Voice Relay Connection Failure (Failed to connect to `wss://4.224.31.8/voice-relay`)
* **Root Cause**: 
  1. The client was trying to connect to `/voice-relay` by default, which Nginx routes to `aural-voice-relay-doubao` on port `8081`.
  2. Because Volcengine credentials were not configured in `.env`, the Doubao relay container crashed at startup (`exited with code 1`).
  3. The intended primary relay is **Azure Speech Service** on port `8083` (`/azure-voice-relay`).
* **Fix**: Update VM 1 `.env` file to default `NEXT_PUBLIC_VOICE_RELAY_URL` to point to `/azure-voice-relay` (resolved).

### ❌ Issue 2: `tts-s2s` Onboarding Check 500 Error
* **Root Cause**: The Next.js API route `/api/voice/tts-s2s` requires `SARVAM_API_KEY`. While it was configured in local development, it was omitted in the VM's `.env`, causing the API to fail.
* **Fix**: Add `SARVAM_API_KEY` to VM 1's `.env` file (resolved).

### ❌ Issue 3: `aural-voice-relay-azure-speech` Loop Crash (`Missing SARVAM_API_KEY`)
* **Root Cause**: 
  1. `azure-speech-relay.ts` throws an error and exits if `SARVAM_API_KEY` is missing in its process environment.
  2. Although `SARVAM_API_KEY` is defined in the host VM's `.env`, it was not listed under the `environment` section of `aural-voice-relay-azure-speech` inside `docker-compose.yml`, so Docker never forwarded it to the running container.
* **Fix**: Updated `docker-compose.yml` to pass `SARVAM_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_VERSION` to the service container (resolved locally, pushed to GitHub).

### ❌ Issue 4: VM-to-VM Bridge Connection Failure (SSL Error / TLS Reject)
* **Root Cause**: 
  1. VM 2's backend contacts VM 1's bridge API over HTTPS (`https://4.224.31.8/api/exam-bridge`).
  2. Because VM 1 uses a self-signed SSL certificate, Node's HTTPS module rejected the request as insecure.
* **Fix**: Added `NODE_TLS_REJECT_UNAUTHORIZED: "0"` in VM 2's `docker-compose.yml` to instruct the backend container to bypass TLS validation for this internal connection (resolved locally, pushed to GitHub).

---

## 4. Current Action Items

To sync the live VM deployments with the fixes pushed to GitHub:

### A. Deploy to VM 1 (Aural)
1. Pull the updated `docker-compose.yml` from GitHub.
2. Ensure your `.env` contains all the keys: `SARVAM_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.
3. Restart containers:
   ```bash
   docker compose down
   docker compose up -d --build --force-recreate
   ```

### B. Deploy to VM 2 (Coding)
1. Pull the updated `docker-compose.yml` from GitHub.
2. Restart the backend:
   ```bash
   docker compose up -d --build --force-recreate coding-backend
   ```
