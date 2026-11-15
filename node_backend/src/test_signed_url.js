import { db } from "../src/db/index.js";
import { v2 as cloudinary } from "cloudinary";
import { config } from "../src/config/env.js";
import https from "https";

cloudinary.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
  secure: true,
});

function fetchUrl(url, label) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`[${label}] Status: ${res.statusCode}, Error: ${res.headers['x-cld-error'] || 'none'}`);
      resolve();
    }).on("error", (err) => {
      console.error(`[${label}] Error: ${err.message}`);
      resolve();
    });
  });
}

async function run() {
  const doc = await db.get("SELECT * FROM accounts_employeedocument ORDER BY id DESC LIMIT 1");
  if (!doc) {
    console.log("No documents found");
    process.exit(0);
  }
  const publicId = doc.file.replace("cloudinary://", "");
  console.log("Public ID:", publicId);

  // Test 5: format is empty string
  const url5 = cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "image",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  console.log("Url 5 (format: ''):", url5);
  await fetchUrl(url5, "Format empty string");

  // Test 6: format is null
  const url6 = cloudinary.utils.private_download_url(publicId, null, {
    resource_type: "image",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  console.log("Url 6 (format: null):", url6);
  await fetchUrl(url6, "Format null");

  process.exit(0);
}

run().catch(console.error);
