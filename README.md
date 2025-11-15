# Azure Blob + SAS Learning Project

A minimal TypeScript/Node.js project that teaches how to:
- Generate temporary upload (SAS) URLs for Azure Blob Storage (similar to AWS S3 presigned URLs)
- Upload files directly from a client using those URLs (bypassing your backend)
- Clean up blobs programmatically
- Use Azurite (Azure Storage emulator) locally via Docker

This repository is deliberately verbose in code comments for beginners who know nothing about Azure Blob Storage.

---
## 1. Absolute Beginner Setup (No Docker Experience Required)

### 1.1 Install Prerequisites
1. Install Node.js (v18+ recommended; project uses Node 24 in Docker). From your package manager or https://nodejs.org
2. Install Docker:
   - Linux: Use your distro package manager (e.g. `sudo apt install docker.io`) then add your user to docker group:
     ```bash
     sudo groupadd docker || true
     sudo usermod -aG docker $USER
     newgrp docker
     docker run hello-world
     ```
   - Verify Docker is running: `docker info`
3. (Optional) Install Docker Compose v2: Usually bundled with recent Docker versions. Check with `docker compose version`.

### 1.2 Clone the Repository
```bash
git clone <your-fork-or-this-repo-url> azur-test
cd azur-test
```

### 1.3 Install Dependencies
```bash
npm ci
```
This installs exact versions from `package-lock.json`.

### 1.4 Start Azurite + API (Docker Compose)
```bash
docker compose -f docker-compose.dev.yml up --build
```
This will:
- Start Azurite (Blob endpoint exposed at `http://localhost:10000`)
- Build and run the API server on `http://localhost:3000`

### 1.5 Request Upload URLs
In a separate terminal (outside the container):
```bash
curl -X POST "http://localhost:3000/upload-urls?count=3" -H 'Content-Type: application/json'
```
You will receive JSON with `blobName`, `uploadUrl` (SAS), and `fileUrl`.

### 1.6 Upload a File Using a SAS URL
Example (replace with one of the returned URLs):
```bash
curl -X PUT "http://localhost:10000/devstoreaccount1/images/image-123.jpg?sv=...&sp=w&sig=..." \
     -H "x-ms-blob-type: BlockBlob" \
     --data-binary @some-local-file.jpg
```

### 1.7 Run the Demo Client
This script automates requesting SAS URLs and uploading a tiny generated PNG:
```bash
node client.js
```

### 1.8 Clean Up Uploaded Test Files
```bash
npx ts-node cleanup.ts
```
(or after building: `npm run build && node dist/cleanup.js`)

---
## 2. Running Without Docker (Optional Alternate Path)
If you prefer not to use Docker you can run Azurite directly:
```bash
npm install -D azurite
npx azurite --blobHost 127.0.0.1 --location ./azurite-data
```
Set environment variable before starting the server:
```bash
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
node index.ts (or use ts-node if not compiled)
```

---
## 3. Project Structure
```
index.ts          Express server generating SAS upload URLs
client.js         Demo client requesting SAS URLs and uploading a 1x1 PNG
cleanup.ts        Script that deletes all blobs in the images container
Dockerfile        API container definition
docker-compose.dev.yml  Orchestrates API + Azurite
package.json      Dependencies and scripts
```

---
## 4. Azure vs AWS S3 Terminology
| Azure | AWS S3 | Meaning |
|-------|--------|---------|
| Storage Account | AWS Account | Top-level storage scope |
| Container | Bucket | Logical grouping of blobs/objects |
| Blob | Object | File/data stored |
| SAS Token (URL) | Presigned URL | Temporary scoped access |
| Blob Service Client | S3 Client | SDK entry point |

---
## 5. How SAS Upload Flow Works
1. Client requests `/upload-urls?count=N` from backend.
2. Backend generates unique blob names and SAS tokens (write-only, short expiry).
3. Client receives `uploadUrl` values.
4. Client issues `PUT` requests directly to Blob endpoint with header `x-ms-blob-type: BlockBlob`.
5. Azure stores the file; backend never sees the file bytes.

Benefits:
- Reduces backend bandwidth and memory pressure.
- Limits exposure window (short expiry tokens).
- Enables horizontal scaling (storage handles concurrency).

---
## 6. Key Files Explained
### index.ts
- Initializes `BlobServiceClient` using connection string.
- Endpoint `/upload-urls` builds SAS tokens via `generateBlobSASQueryParameters`.
- Uses permission `w` (write) only; cannot read or delete.

### client.js
- Requests SAS URLs.
- Generates minimal valid PNG in memory.
- Uploads sequentially to simplify console output.

### cleanup.ts
- Lists blobs via `listBlobsFlat()`.
- Deletes each blob and prints summary.

---
## 7. Security Notes (Learning Context)
Do NOT hardcode secrets in real applications. Here it is done for clarity. In production:
- Store connection strings in environment variables or secret managers.
- Use role-based access (Managed Identities) instead of account keys where possible.
- Keep SAS expiries minimal (minutes) and permissions narrow.
- Consider client-side MIME validation and size limits.

---
## 8. Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| 403 Authentication failure | Wrong account key | Use Azurite key from README |
| 400 Bad Request | Missing header `x-ms-blob-type` | Add header when uploading |
| Connection refused | Azurite not running | Start docker compose or azurite manually |
| SAS expired | Clock drift or delay | Regenerate new SAS URL |
| Blob not found on read | Wrong container or name | Verify `images` and filename |

Check logs from API container and Azurite:
```bash
docker compose logs api
docker compose logs azurite
```

---
## 9. Extending This Project
Ideas to expand learning:
- Add read (download) SAS tokens (`BlobSASPermissions.parse('r')`).
- Implement delete SAS tokens for client-side removal.
- Add metadata setting on upload.
- Introduce blob versioning and snapshots.
- Integrate with CDN or signed media URLs.

---
## 10. Scripts
| Command | Purpose |
|---------|---------|
| `docker compose -f docker-compose.dev.yml up --build` | Start full stack |
| `node client.js` | Demo upload client |
| `npx ts-node cleanup.ts` | Delete test blobs |
| `npm run build` | Compile TypeScript (if build script defined) |

---
## 11. Environment Variables
`AZURE_STORAGE_CONNECTION_STRING` must include:
```
DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=<AzuriteKey>;BlobEndpoint=http://azurite:10000/devstoreaccount1;
```
AzURITE KEY (for emulator):
```
Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
```

---
## 12. Non-Docker Local Run (Summary)
1. Start Azurite manually.
2. Export connection string.
3. Run `ts-node index.ts` or compile then run.

---
## 13. License
This project is licensed under the GNU General Public License v3.0. See `LICENSE` file.

---
## 14. Disclaimer
Educational only. Do not ship hardcoded credentials or permissive SAS configurations to production.

---
## 15. Minimal Flow Recap
```
Client -> Backend: request N upload URLs
Backend -> Azure: create SAS tokens for blob names
Backend -> Client: return upload URLs
Client -> Azure: PUT file with SAS URL
Cleanup Script -> Azure: list and delete blobs
```

End of README.
