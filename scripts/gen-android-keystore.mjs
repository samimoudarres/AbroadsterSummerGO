import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

const dir = resolve('secrets');
mkdirSync(dir, { recursive: true });
const keystorePath = resolve(dir, 'abroadster-myapp.jks');
const password = randomBytes(18).toString('base64url');
const alias = 'abroadster';

if (existsSync(keystorePath)) {
  console.log('Keystore already exists:', keystorePath);
  process.exit(0);
}

const dname = 'CN=Abroadster, OU=Mobile, O=Abroadster, L=Durham, ST=NC, C=US';
execSync(
  [
    'keytool',
    '-genkeypair',
    '-v',
    '-storetype PKCS12',
    `-keystore "${keystorePath}"`,
    `-alias ${alias}`,
    '-keyalg RSA',
    '-keysize 2048',
    '-validity 10000',
    `-storepass "${password}"`,
    `-keypass "${password}"`,
    `-dname "${dname}"`,
  ].join(' '),
  { stdio: 'inherit', shell: true },
);

const creds = {
  keystorePath: 'secrets/abroadster-myapp.jks',
  keystorePassword: password,
  keyAlias: alias,
  keyPassword: password,
  packageName: 'com.abroadster.myapp',
};
writeFileSync(
  resolve(dir, 'android-keystore.credentials.json'),
  JSON.stringify(creds, null, 2) + '\n',
  { mode: 0o600 },
);
console.log('Wrote secrets/android-keystore.credentials.json (gitignored)');
console.log('Keystore ready for com.abroadster.myapp');
