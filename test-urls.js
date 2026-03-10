const fs = require('fs');
const https = require('https');
const path = require('path');

// Read the documentation.json file
const filePath = path.join(__dirname, 'documentation.json');
const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// Array to store all extracted paths
const allPaths = [];

// Recursive function to extract all paths from the JSON structure
function extractPaths(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(item => extractPaths(item));
  } else if (obj !== null && typeof obj === 'object') {
    if (obj.path && typeof obj.path === 'string') {
      allPaths.push(obj.path);
    }
    Object.values(obj).forEach(value => extractPaths(value));
  }
}

// Extract all paths
extractPaths(jsonData);

// Remove duplicates
const uniquePaths = [...new Set(allPaths)];

// Get all files from docs folder
const docsPath = path.join(__dirname, 'docs');
const docFiles = new Set();

if (fs.existsSync(docsPath)) {
  const files = fs.readdirSync(docsPath);
  files.forEach(file => {
    const fileNameWithoutExt = file.replace(/\.(mdx|md)$/, '');
    docFiles.add(fileNameWithoutExt);
  });
}

// Filter paths to only test those that exist in the docs folder
const existingPaths = uniquePaths.filter(p => {
  // Extract the doc name from path (e.g., "docs/accessing-capillary" -> "accessing-capillary")
  const docName = p.replace(/^docs\//, '').replace(/^hai$/, 'hai');
  return docFiles.has(docName);
});

const missingPaths = uniquePaths.filter(p => {
  const docName = p.replace(/^docs\//, '').replace(/^hai$/, 'hai');
  return !docFiles.has(docName);
});

console.log(`\n📋 Documentation Analysis\n`);
console.log('=' .repeat(80));
console.log(`Total unique paths in JSON: ${uniquePaths.length}`);
console.log(`Documentation files found: ${docFiles.size}`);
console.log(`Paths matching existing files: ${existingPaths.length}`);
console.log(`Paths WITHOUT corresponding files: ${missingPaths.length}`);
console.log('=' .repeat(80));

// Test each URL
async function testURL(urlPath) {
  return new Promise((resolve) => {
    const fullUrl = `https://python.documentationai.com/${urlPath}`;
    const urlObj = new URL(fullUrl);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'HEAD',
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      const statusCode = res.statusCode;
      const status = statusCode >= 200 && statusCode < 400 ? '✅ OK' : `⚠️  STATUS ${statusCode}`;
      resolve({
        path: urlPath,
        url: fullUrl,
        statusCode: statusCode,
        status: status
      });
    });

    req.on('error', (err) => {
      resolve({
        path: urlPath,
        url: fullUrl,
        statusCode: null,
        status: `❌ ERROR: ${err.code || err.message}`,
        error: true
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        path: urlPath,
        url: fullUrl,
        statusCode: null,
        status: `⏱️  TIMEOUT`,
        error: true
      });
    });

    req.end();
  });
}

// Test all URLs
async function runTests() {
  const results = [];
  
  console.log(`\n🔍 Testing ${existingPaths.length} URLs with existing files...\n`);
  
  // Test URLs with a concurrency limit (5 at a time)
  for (let i = 0; i < existingPaths.length; i += 5) {
    const batch = existingPaths.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(testURL));
    results.push(...batchResults);
    
    // Show progress
    const processed = Math.min(i + 5, existingPaths.length);
    console.log(`Progress: ${processed}/${existingPaths.length}`);
  }
  
  // Sort results: errors first, then by status
  results.sort((a, b) => {
    if (a.error !== b.error) return a.error ? -1 : 1;
    return a.statusCode !== b.statusCode ? (a.statusCode || 0) - (b.statusCode || 0) : 0;
  });
  
  // Display results
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 TEST RESULTS FOR EXISTING FILES\n');
  
  const working = results.filter(r => r.statusCode >= 200 && r.statusCode < 300);
  const errors = results.filter(r => r.error);
  const other = results.filter(r => !r.error && (r.statusCode < 200 || r.statusCode >= 300));
  
  if (working.length > 0) {
    console.log(`✅ Working URLs (${working.length}):`);
    working.slice(0, 20).forEach(r => {
      console.log(`   ${r.status} - ${r.path}`);
    });
    if (working.length > 20) {
      console.log(`   ... and ${working.length - 20} more working URLs`);
    }
  }
  
  if (other.length > 0) {
    console.log(`\n⚠️  Other Status Codes (${other.length}):`);
    other.forEach(r => {
      console.log(`   ${r.status} - ${r.path}`);
    });
  }
  
  if (errors.length > 0) {
    console.log(`\n❌ Failed URLs (${errors.length}):`);
    errors.forEach(r => {
      console.log(`   ${r.status} - ${r.path}`);
    });
  }
  
  // Show missing files
  if (missingPaths.length > 0) {
    console.log(`\n\n📁 Missing Files (paths in JSON but no corresponding file):\n`);
    console.log(`❌ ${missingPaths.length} paths without files:`);
    missingPaths.slice(0, 30).forEach(p => {
      console.log(`   ❌ ${p}`);
    });
    if (missingPaths.length > 30) {
      console.log(`   ... and ${missingPaths.length - 30} more missing files`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total paths in JSON: ${uniquePaths.length}`);
  console.log(`   Actual files in docs/: ${docFiles.size}`);
  console.log(`   ✅ URLs tested (files exist): ${existingPaths.length}`);
  console.log(`   ❌ Missing files (paths without files): ${missingPaths.length}`);
  console.log(`\n   Testing Results:`);
  console.log(`      ✅ Working: ${working.length} (${((working.length / existingPaths.length) * 100).toFixed(2)}%)`);
  console.log(`      ⚠️  Other Status: ${other.length}`);
  console.log(`      ❌ Failed: ${errors.length}`);
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Save results to file
  const reportPath = path.join(__dirname, 'url-test-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPathsInJson: uniquePaths.length,
      actualFilesInDocs: docFiles.size,
      urlsTested: existingPaths.length,
      missingFiles: missingPaths.length,
      working: working.length,
      otherStatus: other.length,
      failed: errors.length
    },
    workingUrls: working.map(r => ({ path: r.path, url: r.url })),
    failedUrls: [...other, ...errors].map(r => ({ path: r.path, url: r.url, status: r.status })),
    missingFiles: missingPaths
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Detailed report saved to: url-test-report.json\n`);
}

runTests().catch(err => {
  console.error('❌ Error during testing:', err);
  process.exit(1);
});
