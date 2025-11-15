import { BlobServiceClient } from '@azure/storage-blob';

const connectionString = "AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;DefaultEndpointsProtocol=http;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;";

console.log("Testing connection to Azurite...");

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
console.log("BlobServiceClient URL:", blobServiceClient.url);

async function test() {
    try {
        const containerClient = blobServiceClient.getContainerClient("test-container");
        console.log("Container URL:", containerClient.url);
        console.log("\nAttempting to create container...");
        const response = await containerClient.createIfNotExists();
        console.log("Success! Container created or already exists.");
        console.log(response);
    } catch (error) {
        console.error("Error:", error.message);
        console.error("Status Code:", error.statusCode);
        console.error("Request ID:", error.details?.['x-ms-request-id']);
    }
}

test();
