const fs = require('fs');
const os = require('os');
const path = require('path');

const file = path.join(os.homedir(), 'Library/Group Containers/group.com.docker/settings-store.json');

if (!fs.existsSync(file)) {
  console.error('❌ Error: Docker settings-store.json file not found at:', file);
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.deprecatedCgroupv1 = true;
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log('✅ Successfully updated settings-store.json to enable cgroup v1!');
} catch (err) {
  console.error('❌ Error reading or writing settings file:', err.message);
  process.exit(1);
}
