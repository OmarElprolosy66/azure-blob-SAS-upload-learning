/**
 * AZURE BLOB STORAGE CLEANUP UTILITY
 * 
 * This script deletes all blobs (files) from the "images" container.
 * Use this to clean up the fake images uploaded during testing.
 * 
 * WHAT IT DOES:
 * 1. Connects to Azure Blob Storage (Azurite emulator)
 * 2. Lists all blobs in the "images" container
 * 3. Deletes each blob one by one
 * 4. Shows progress and results
 * 
 * USAGE:
 *   npm run build && node dist/cleanup.js
 *   OR
 *   npx ts-node cleanup.ts
 * 
 * AZURE vs S3 TERMINOLOGY:
 * - Blob = S3 Object (individual file)
 * - Container = S3 Bucket (folder for files)
 * - Delete blob = Delete object
 */

import {
    BlobServiceClient,           // Main client to connect to Azure Blob Storage
    StorageSharedKeyCredential,  // Authentication using account name + secret key
} from '@azure/storage-blob';

// ============================================================================
// AZURE AUTHENTICATION SETUP
// ============================================================================

/**
 * CONNECTION STRING
 * 
 * In a real app, you'd get this from environment variables.
 * For this cleanup script, we hardcode it for simplicity.
 * 
 * This is the Azurite (local emulator) connection string with the correct key.
 */
const connectionString = "AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;DefaultEndpointsProtocol=http;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;";

/**
 * BLOB SERVICE CLIENT
 * 
 * Creates a client that can talk to Azure Blob Storage.
 * Uses localhost:10000 since we're running outside Docker.
 * 
 * S3 equivalent: new S3Client({ region: 'us-east-1', credentials: {...} })
 */
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

/**
 * Deletes all blobs from the specified container.
 * 
 * PROCESS:
 * 1. Get a client for the container
 * 2. Check if container exists
 * 3. List all blobs in the container
 * 4. Delete each blob
 * 5. Report results
 * 
 * @param containerName - Name of container to clean up (Azure: Container | S3: Bucket)
 */
async function cleanupContainer(containerName: string) {
    console.log(`\n[STATUS] Cleaning up container: "${containerName}"\n`);
    
    /**
     * CONTAINER CLIENT
     * 
     * Manages operations on a specific container.
     * Can list blobs, delete container, set permissions, etc.
     * 
     * S3 equivalent: operations on a specific bucket
     */
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // ========================================================================
    // STEP 1: Check if container exists
    // ========================================================================
    
    const containerExists = await containerClient.exists();
    
    if (!containerExists) {
        console.log(`[INFO] Container "${containerName}" does not exist. Nothing to clean up.`);
        return;
    }
    
    console.log(`[INFO] Container "${containerName}" exists. Listing blobs...\n`);
    
    // ========================================================================
    // STEP 2: List all blobs in the container
    // ========================================================================
    
    /**
     * LIST BLOBS
     * 
     * Returns an async iterator of all blobs in the container.
     * Each blob has properties like name, size, lastModified, etc.
     * 
     * S3 equivalent: listObjectsV2()
     * 
     * HOW IT WORKS:
     * - Azure returns blobs in pages (batches)
     * - The iterator automatically handles pagination
     * - Use "for await" to loop through all blobs
     */
    const blobsToDelete: string[] = [];
    
    for await (const blob of containerClient.listBlobsFlat()) {
        /**
         * BLOB PROPERTIES:
         * - name: Filename (e.g., "image-1763249171296-s7xsogdx7xj.jpg")
         * - properties.contentLength: File size in bytes
         * - properties.lastModified: When file was last changed
         * - properties.contentType: MIME type (e.g., "image/png")
         */
        console.log(`   [INFO] Found: ${blob.name} (${blob.properties.contentLength} bytes)`);
        blobsToDelete.push(blob.name);
    }
    
    if (blobsToDelete.length === 0) {
        console.log('\n[INFO] Container is already empty. Nothing to delete.');
        return;
    }
    
    console.log(`\n[INFO] Found ${blobsToDelete.length} blob(s) to delete.\n`);
    
    // ========================================================================
    // STEP 3: Delete each blob
    // ========================================================================
    
    let successCount = 0;
    let failCount = 0;
    
    for (const blobName of blobsToDelete) {
        try {
            /**
             * DELETE BLOB
             * 
             * Permanently removes the blob from Azure Blob Storage.
             * 
             * S3 equivalent: deleteObject()
             * 
             * DELETE OPTIONS:
             * - deleteSnapshots: 'include' - Also delete any snapshots of this blob
             *   (Snapshots are point-in-time copies of the blob)
             * 
             * RETURN VALUE:
             * - requestId: Unique ID for this delete operation
             * - date: When the delete happened
             * - version: API version used
             */
            const blobClient = containerClient.getBlobClient(blobName);
            await blobClient.delete({
                deleteSnapshots: 'include', // Also delete snapshots if any exist
            });
            
            console.log(`   [INFO] Successfully deleted: ${blobName}`);
            successCount++;
            
        } catch (error: any) {
            /**
             * COMMON ERRORS:
             * - BlobNotFound: Blob was already deleted (race condition)
             * - AuthorizationFailure: Wrong credentials
             * - LeaseIdMissing: Blob is locked by a lease
             */
            console.error(`   [ERROR] Failed to delete ${blobName}: ${error.message}`);
            failCount++;
        }
    }
    
    // ========================================================================
    // STEP 4: Show results
    // ========================================================================
    
    console.log('\n' + '='.repeat(60));
    console.log('[INFO] CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`[INFO] Total blobs found:    ${blobsToDelete.length}`);
    console.log(`[INFO] Successfully deleted: ${successCount}`);
    console.log(`[INFO] Failed to delete:     ${failCount}`);
    console.log('='.repeat(60) + '\n');
    
    if (successCount === blobsToDelete.length) {
        console.log('[INFO] All blobs deleted successfully!');
    } else if (successCount > 0) {
        console.log('[WARN] Some blobs could not be deleted. Check errors above.');
    } else {
        console.log('[ERROR] No blobs were deleted. Check errors above.');
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Run the cleanup for the "images" container.
 * 
 * You can modify this to clean up other containers:
 *   await cleanupContainer('videos');
 *   await cleanupContainer('documents');
 */
async function main() {
    try {
        console.log('[INFO] Starting Azure Blob Storage Cleanup...');
        
        // Clean up the "images" container (where we uploaded fake images)
        await cleanupContainer('images');
        
        console.log('\n[INFO] Cleanup completed!\n');
        
    } catch (error: any) {
        console.error('\n[ERROR] Cleanup failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run the main function
main();

/**
 * OPTIONAL: DELETE THE ENTIRE CONTAINER
 * 
 * If you want to delete the entire container (not just the blobs), use:
 * 
 *   const containerClient = blobServiceClient.getContainerClient('images');
 *   await containerClient.delete();
 *   console.log('Container deleted!');
 * 
 * This is like deleting an S3 bucket (bucket must be empty first, or use force option).
 * 
 * To delete with all blobs inside:
 *   await containerClient.delete({ 
 *     deleteSnapshots: 'include' 
 *   });
 */

/**
 * ALTERNATIVE: DELETE BLOBS MATCHING A PATTERN
 * 
 * To delete only specific blobs (e.g., old files):
 * 
 *   for await (const blob of containerClient.listBlobsFlat()) {
 *     // Only delete files older than 7 days
 *     const age = Date.now() - blob.properties.lastModified.getTime();
 *     const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
 *     
 *     if (age > sevenDaysMs) {
 *       const blobClient = containerClient.getBlobClient(blob.name);
 *       await blobClient.delete();
 *       console.log(`Deleted old blob: ${blob.name}`);
 *     }
 *   }
 * 
 * Or delete by name pattern:
 *   if (blob.name.startsWith('temp-')) {
 *     // Delete temporary files
 *   }
 */
