/**
 * AZURE BLOB STORAGE CLIENT - UPLOAD DEMO
 * 
 * This client demonstrates how to:
 * 1. Request temporary upload URLs from our backend server
 * 2. Create a fake image file
 * 3. Upload directly to Azure Blob Storage using SAS URLs (no backend involved)
 * 
 * WORKFLOW:
 * ┌─────────────┐     Request URLs       ┌─────────────┐
 * │   Client    │ ──────────────────────>│   Backend   │
 * │ (this file) │                        │   Server    │
 * └─────────────┘                        └─────────────┘
 *       │                                       │
 *       │            SAS URLs with              │
 *       │      temporary permissions            │
 *       │<──────────────────────────────────────┤
 *       │                                       
 *       │         Upload file directly          ┌─────────────┐
 *       └──────────────────────────────────────>│   Azure     │
 *                (bypasses backend)             │   Blob      │
 *                                               │  Storage    │
 *                                               └─────────────┘
 * 
 * BENEFITS OF THIS APPROACH:
 * - Backend doesn't handle file data (saves bandwidth and memory)
 * - Faster uploads (direct connection to storage)
 * - More secure (SAS tokens expire automatically)
 * - Scalable (storage handles the load, not your server)
 */

import { Buffer } from 'buffer';

// ============================================================================
// STEP 1: Request Upload URLs from Backend
// ============================================================================

/**
 * Ask our backend server to generate temporary upload URLs.
 * 
 * The backend will:
 * 1. Connect to Azure Blob Storage
 * 2. Generate unique filenames
 * 3. Create SAS tokens (temporary permission strings)
 * 4. Return upload URLs that expire in 5 minutes
 * 
 * S3 equivalent: Requesting presigned URLs from your backend
 */
fetch('http://localhost:3000/upload-urls?count=5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
})
    .then((response) => response.json())
    .then(async (data) => {
        /**
         * Backend responds with array of upload URL objects:
         * {
         *   urls: [
         *     {
         *       blobName: "image-1763249068986-8a0sot14h03.jpg",
         *       uploadUrl: "http://azurite:10000/.../image-123.jpg?sv=2025-11-05&sp=w&sig=...",
         *       fileUrl: "http://azurite:10000/.../image-123.jpg"
         *     },
         *     ...
         *   ]
         * }
         */
        console.log('Received upload URLs:', data.urls);
        
        // ====================================================================
        // STEP 2: Create a Fake Image
        // ====================================================================
        
        /**
         * CREATING A 1x1 PIXEL PNG IMAGE
         * 
         * This is the smallest valid PNG file (67 bytes).
         * In a real application, you would:
         * - Read an actual image file: fs.readFileSync('photo.jpg')
         * - Get file from user upload: <input type="file">
         * - Generate image with canvas/sharp library
         * - Take a photo with a camera
         * - Take a stream from video input
         * 
         * PNG FILE STRUCTURE:
         * - PNG Signature (8 bytes): Identifies file as PNG
         * - IHDR Chunk (25 bytes): Image dimensions and color info
         * - IDAT Chunk (22 bytes): Compressed pixel data
         * - IEND Chunk (12 bytes): End of file marker
         */
        const fakeImageBuffer = Buffer.from([
            // PNG Signature (magic bytes that identify this as a PNG file)
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            
            // IHDR Chunk (Image Header - defines dimensions and properties)
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // Width: 1px, Height: 1px
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89,
            
            // IDAT Chunk (Image Data - the actual pixel data, compressed)
            0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
            
            // IEND Chunk (End of PNG file)
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82
        ]);
        
        console.log(`\nCreated fake image: ${fakeImageBuffer.length} bytes`);
        
        // ====================================================================
        // STEP 3: Upload Files to Azure Blob Storage
        // ====================================================================
        
        console.log('\nStarting uploads...\n');
        
        /**
         * Loop through each upload URL and upload the image.
         * 
         * This happens in parallel (all uploads at once), but we use a for loop
         * with await to upload sequentially for clearer console output.
         * 
         * In production, you might use Promise.all() to upload in parallel:
         * await Promise.all(data.urls.map(urlData => uploadFile(urlData)))
         */
        for (const urlData of data.urls) {
            try {
                console.log(`Uploading to: ${urlData.blobName}`);
                
                /**
                 * URL HOSTNAME CONVERSION
                 * 
                 * Problem: Backend runs in Docker and returns URLs with "azurite:10000"
                 *          (Docker network hostname)
                 * 
                 * Solution: Replace with "localhost:10000" so our client (running
                 *           outside Docker) can reach the storage server
                 * 
                 * In production with real Azure:
                 * - URLs would use: yourStorageAccount.blob.core.windows.net
                 * - No replacement needed (publicly accessible)
                 */
                const clientUploadUrl = urlData.uploadUrl.replace('azurite:10000', 'localhost:10000');
                
                /**
                 * UPLOAD USING SAS URL
                 * 
                 * This is the magic! We upload directly to Azure Blob Storage
                 * using the temporary SAS URL (no backend server involved).
                 * 
                 * HTTP METHOD: PUT (Azure requires PUT for blob uploads)
                 * S3 equivalent: PUT request to presigned URL
                 * 
                 * REQUIRED HEADERS:
                 * - x-ms-blob-type: "BlockBlob" (Azure-specific, tells Azure this is a regular file)
                 *   Other types: "AppendBlob" (logs), "PageBlob" (VM disks)
                 * 
                 * - Content-Type: "image/png" (MIME type of file)
                 *   Helps browsers know how to display the file
                 * 
                 * BODY: The actual file data as a Buffer
                 */
                const uploadResponse = await fetch(clientUploadUrl, {
                    method: 'PUT',
                    headers: {
                        'x-ms-blob-type': 'BlockBlob', // Azure-specific: type of blob
                        'Content-Type': 'image/png',    // Standard: file MIME type
                    },
                    body: fakeImageBuffer, // The actual file data
                });
                
                /**
                 * CHECK UPLOAD RESULT
                 * 
                 * HTTP STATUS CODES:
                 * - 201 Created: Upload successful (new blob created)
                 * - 200 OK: Upload successful (existing blob replaced)
                 * - 403 Forbidden: SAS token invalid or expired
                 * - 404 Not Found: Container doesn't exist
                 * - 400 Bad Request: Missing headers or invalid data
                 */
                if (uploadResponse.ok) {
                    // Success! The file is now stored in Azure Blob Storage
                    console.log(`[STATUS] Success! Uploaded to: ${urlData.blobName}`);
                    console.log(`[INFO]    File URL: ${urlData.fileUrl}\n`);
                } else {
                    // Upload failed - show error details
                    console.error(`[ERROR] Failed to upload ${urlData.blobName}`);
                    console.error(`[ERROR]    Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
                    const errorText = await uploadResponse.text();
                    console.error(`[ERROR]    ${errorText}\n`);
                }
                
            } catch (error) {
                /**
                 * NETWORK ERRORS
                 * 
                 * Common errors:
                 * - "fetch failed": Can't reach storage server (wrong hostname/port)
                 * - "ECONNREFUSED": Storage server not running
                 * - "ETIMEDOUT": Request took too long (network issues)
                 */
                console.error(`[ERROR] Error uploading ${urlData.blobName}:`, error.message);
            }
        }
        
        console.log('Upload process completed!');
    })
    .catch((error) => {
        /**
         * ERROR FETCHING UPLOAD URLS
         * 
         * This catches errors from the initial request to our backend.
         * 
         * Common errors:
         * - Backend server not running (ECONNREFUSED)
         * - Backend returned non-JSON response
         * - Network timeout
         */
        console.error('[ERROR] Error fetching upload URLs:', error);
    });

/**
 * WHAT HAPPENS AFTER UPLOAD?
 * 
 * Once uploaded, the files are stored in Azure Blob Storage at:
 * Container: "images" (Azure) / Bucket (S3)
 * Files: image-1763249068986-8a0sot14h03.jpg, etc.
 * 
 * TO ACCESS THE FILES:
 * 
 * 1. PUBLIC ACCESS (if container is public):
 *    Just use the fileUrl: http://localhost:10000/devstoreaccount1/images/image-123.jpg
 * 
 * 2. PRIVATE ACCESS (recommended):
 *    Generate a new SAS URL with read permissions:
 *    - Call your backend: GET /download-url?blobName=image-123.jpg
 *    - Backend generates SAS token with 'r' (read) permission
 *    - Use the returned URL to download the file
 * 
 * 3. DIRECT ACCESS (requires authentication):
 *    Use Azure SDK with credentials to download:
 *    const blobClient = containerClient.getBlobClient('image-123.jpg');
 *    const buffer = await blobClient.downloadToBuffer();
 * 
 * AZURE BLOB STORAGE FEATURES YOU CAN EXPLORE:
 * - Blob metadata: Store custom key-value pairs with each file
 * - Blob tiers: Hot (frequent access), Cool (infrequent), Archive (rarely accessed)
 * - Blob leasing: Lock a blob for exclusive access
 * - Blob snapshots: Create point-in-time copies
 * - Blob versioning: Keep history of all changes
 * - Lifecycle policies: Automatically delete or move old files
 * 
 * S3 EQUIVALENTS:
 * - Metadata: Object metadata
 * - Tiers: Storage classes (Standard, Infrequent Access, Glacier)
 * - Leasing: Object lock
 * - Snapshots: Object versioning
 * - Lifecycle: Lifecycle rules
 */

