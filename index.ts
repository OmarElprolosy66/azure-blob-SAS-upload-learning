/**
 * AZURE BLOB STORAGE UPLOAD URL GENERATOR
 * 
 * This server generates temporary upload URLs for Azure Blob Storage (similar to AWS S3).
 * 
 * AZURE vs S3 TERMINOLOGY:
 * ┌─────────────────────┬─────────────────────┬──────────────────────────────┐
 * │ Azure               │ AWS S3              │ What it is                   │
 * ├─────────────────────┼─────────────────────┼──────────────────────────────┤
 * │ Storage Account     │ AWS Account         │ Top-level account            │
 * │ Container           │ Bucket              │ Folder for files             │
 * │ Blob                │ Object              │ Individual file              │
 * │ SAS Token           │ Presigned URL       │ Temporary access link        │
 * │ Blob Service Client │ S3 Client           │ SDK to talk to storage       │
 * └─────────────────────┴─────────────────────┴──────────────────────────────┘
 */

import express, { type Request, type Response } from 'express';
import {
    BlobServiceClient,              // Main client to connect to Azure Blob Storage (like AWS S3 client)
    StorageSharedKeyCredential,     // Authentication using account name + secret key
    generateBlobSASQueryParameters, // Creates SAS tokens (like S3 presigned URLs)
    BlobSASPermissions,             // Defines permissions: read, write, delete, etc.
    SASProtocol,                    // Specifies HTTP/HTTPS protocol for URLs
} from '@azure/storage-blob';

/**
 * Parses Azure connection string into key-value pairs
 * 
 * Example input:
 * "AccountName=devstoreaccount1;AccountKey=abc123;BlobEndpoint=http://localhost:10000"
 * 
 * Example output:
 * { AccountName: "devstoreaccount1", AccountKey: "abc123", BlobEndpoint: "http://localhost:10000" }
 */
function parseConnectionString(connectionString: string) {
    const parts = connectionString.split(";");
    const out: any = {};
    for (const p of parts) {
        const [key, value] = p.split("=");
        if (key && value) out[key] = value;
    }
    return out;
}

// ============================================================================
// EXPRESS SERVER SETUP
// ============================================================================
const app = express();
const port = 3000;

// Enable JSON parsing for request bodies
app.use(express.json());

// ============================================================================
// AZURE AUTHENTICATION SETUP
// ============================================================================

/**
 * Connection string contains all info needed to connect to Azure Blob Storage:
 * - Account name (username)
 * - Account key (password)
 * - Endpoints (where the storage server is)
 * 
 * In production, this comes from Azure Portal.
 * In development, this connects to Azurite (local Azure emulator).
 */
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
console.log(`Using Azure Storage Connection String: ${connectionString}`);
if (!connectionString) {
    throw new Error("Azure Storage Connection String not found. Make sure 'AZURE_STORAGE_CONNECTION_STRING' is set in docker-compose.yml");
}

// Extract credentials from connection string
const parsed = parseConnectionString(connectionString);

const accountName  = parsed["AccountName"];  // Like: "devstoreaccount1" (S3 equivalent: AWS Account ID)
const accountKey   = parsed["AccountKey"];   // Secret key for authentication (S3 equivalent: Secret Access Key)
const blobEndpoint = parsed["BlobEndpoint"]; // Storage server URL (S3 equivalent: s3.amazonaws.com)

console.log(`Using Account Name: ${accountName}`);
console.log(`Using Blob Endpoint: ${blobEndpoint}`);

/**
 * CREDENTIAL OBJECT
 * 
 * Think of this like a username/password combo that proves you're authorized.
 * Used to sign SAS tokens (prove they're legitimate).
 * 
 * S3 equivalent: AWS credentials (Access Key ID + Secret Access Key)
 */
const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey
);

/**
 * BLOB SERVICE CLIENT
 * 
 * This is the main client that talks to Azure Blob Storage.
 * It knows:
 * - Where the storage server is (endpoint from connection string)
 * - How to authenticate (credentials)
 * - Network settings (retry logic, timeouts, etc.)
 * 
 * S3 equivalent: new S3Client({ region: 'us-east-1', credentials: {...} })
 * 
 * HOW IT WORKS:
 * 1. Reads connection string to find storage endpoints
 * 2. Uses accountName + accountKey to authenticate every request
 * 3. Sends HTTP requests to Azure Blob Storage API
 * 4. Handles errors, retries, and responses
 */
const blobServiceClient = BlobServiceClient.fromConnectionString(
    connectionString,
    {
        retryOptions: { maxTries: 1 } // Don't retry failed requests (fail fast for development)
    }
);

// ============================================================================
// API ENDPOINT: Generate Upload URLs
// ============================================================================

/**
 * POST /upload-urls?count=5
 * 
 * This endpoint generates temporary upload URLs for files.
 * 
 * HOW IT WORKS (like S3 presigned URLs):
 * 1. Client calls this endpoint: POST /upload-urls?count=3
 * 2. Server generates 3 unique filenames
 * 3. Server creates 3 SAS tokens (temporary permission strings)
 * 4. Server returns 3 uploadUrls that expire in 5 minutes
 * 5. Client can directly upload files to Azure using those URLs (no backend involved)
 * 
 * BENEFITS:
 * - Frontend uploads directly to Azure (saves server bandwidth)
 * - Backend doesn't handle file data (more secure, faster)
 * - URLs expire automatically (limited time window for uploads)
 */
app.post('/upload-urls', async (req: Request, res: Response) => {
    try {
        // ====================================================================
        // STEP 1: Get or create the container (S3 equivalent: bucket)
        // ====================================================================
        
        const containerName = 'images'; // Azure: Container | S3: Bucket
        
        /**
         * CONTAINER CLIENT
         * 
         * Manages a specific container (like a folder for files).
         * Can create containers, list blobs, set permissions, etc.
         * 
         * S3 equivalent: bucket operations in S3 client
         */
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Create container if it doesn't exist (like creating an S3 bucket)
        await containerClient.createIfNotExists();

        // ====================================================================
        // STEP 2: Parse query parameters
        // ====================================================================
        
        const { count } = req.query;
        const numUrls = parseInt(count as string) || 1; // How many upload URLs to generate
        
        // ====================================================================
        // STEP 3: Generate upload URLs
        // ====================================================================
        
        const urls = Array.from({ length: numUrls }).map(() => {
            // Generate unique filename
            // Example: "image-1763247782909-2n9zyybjrf4.jpg"
            const blobName = `image-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.jpg`;
            // Azure: Blob name | S3: Object key

            /**
             * BLOB CLIENT
             * 
             * Manages a specific file (blob) in the container.
             * Can upload, download, delete, get metadata, etc.
             * 
             * S3 equivalent: operations on a specific object key
             * 
             * Example URL this client uses:
             * http://azurite:10000/devstoreaccount1/images/image-123.jpg
             */
            const blobClient = containerClient.getBlockBlobClient(blobName);

            /**
             * SAS TOKEN (Shared Access Signature)
             * 
             * WHAT IS IT?
             * A SAS token is like a temporary password embedded in a URL.
             * It grants limited permissions for a limited time.
             * 
             * S3 equivalent: Presigned URL query parameters
             * 
             * ANATOMY OF A SAS TOKEN:
             * sv=2025-11-05          - Service version (API version)
             * spr=https,http         - Protocol (HTTP and/or HTTPS)
             * st=2025-11-15T23:03:02Z - Start time (when token becomes valid)
             * se=2025-11-15T23:08:02Z - Expiry time (when token expires)
             * sr=b                   - Resource type (b = blob/file)
             * sp=w                   - Permissions (w = write only)
             * sig=nWHF%2FJvaJ2...    - Signature (proves token is authentic)
             * 
             * HOW IT WORKS:
             * 1. You create a token with specific permissions and expiry
             * 2. You sign it with your secret key (creates the 'sig' part)
             * 3. Azure checks the signature to verify it's legitimate
             * 4. If valid and not expired, Azure allows the action
             * 
             * SECURITY:
             * - Can't be forged (signature proves it came from you)
             * - Expires automatically (5 minutes in this case)
             * - Limited permissions (write-only, can't read or delete)
             */
            const sasToken = generateBlobSASQueryParameters({
                containerName,                // Which container (S3: bucket)
                blobName,                     // Which file (S3: object key)
                permissions: BlobSASPermissions.parse('w'), // 'w' = write only (can upload but not read/delete)
                protocol: SASProtocol.HttpsAndHttp,         // Works over HTTP and HTTPS
                startsOn: new Date(),                       // Valid starting now
                expiresOn: new Date(new Date().valueOf() + 5 * 60 * 1000), // Expires in 5 minutes
            }, sharedKeyCredential).toString(); // Sign with secret key to prove it's authentic

            /**
             * UPLOAD URL
             * 
             * Combine the blob URL with the SAS token to create a temporary upload link.
             * 
             * Example:
             * http://azurite:10000/devstoreaccount1/images/image-123.jpg?sv=2025-11-05&sp=w&sig=...
             * 
             * Anyone with this URL can upload to this specific file for 5 minutes.
             * After 5 minutes, the URL stops working (signature expires).
             */
            const uploadUrl = `${blobClient.url}?${sasToken}`;
            
            /**
             * FILE URL
             * 
             * Permanent URL to the file (without SAS token).
             * Use this to read the file later (requires authentication).
             * 
             * Example:
             * http://azurite:10000/devstoreaccount1/images/image-123.jpg
             */
            const fileUrl = blobClient.url;
            
            return {
                blobName,      // Filename (Azure: blob name | S3: object key)
                uploadUrl,     // Temporary upload URL with SAS token (Azure: SAS URL | S3: presigned URL)
                fileUrl,       // Permanent file URL (Azure: blob URL | S3: object URL)
            };
        });
        
        // Return array of upload URLs
        res.json({ urls });
        
    } catch (error: any) {
        console.error(error);
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(port, () => {
    console.log(`Node app (TypeScript) listening at http://localhost:${port}`);
});

/**
 * EXAMPLE USAGE:
 * 
 * 1. Client requests upload URLs:
 *    POST http://localhost:3000/upload-urls?count=2
 * 
 * 2. Server responds with:
 *    {
 *      "urls": [
 *        {
 *          "blobName": "image-1763247782909-2n9zyybjrf4.jpg",
 *          "uploadUrl": "http://azurite:10000/devstoreaccount1/images/image-1763247782909-2n9zyybjrf4.jpg?sv=2025-11-05&sp=w&sig=...",
 *          "fileUrl": "http://azurite:10000/devstoreaccount1/images/image-1763247782909-2n9zyybjrf4.jpg"
 *        },
 *        {
 *          "blobName": "image-1763247782910-x8c7wvgaz5b.jpg",
 *          "uploadUrl": "http://azurite:10000/devstoreaccount1/images/image-1763247782910-x8c7wvgaz5b.jpg?sv=2025-11-05&sp=w&sig=...",
 *          "fileUrl": "http://azurite:10000/devstoreaccount1/images/image-1763247782910-x8c7wvgaz5b.jpg"
 *        }
 *      ]
 *    }
 * 
 * 3. Client uploads file directly to Azure using uploadUrl:
 *    PUT http://azurite:10000/devstoreaccount1/images/image-1763247782909-2n9zyybjrf4.jpg?sv=2025-11-05&sp=w&sig=...
 *    Body: <image file data>
 * 
 * 4. File is stored in Azure Blob Storage (no backend involved in upload)
 */
