import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync('.env', 'utf8');
const token = (env.match(/^EXPO_TOKEN=(.*)$/m) || [])[1]?.trim();
const projectId = '6db82ecb-bbfd-472a-882c-25f4875daea4';
const expected = '14:B2:D7:94:34:D7:84:CD:D6:8D:4F:32:A3:FC:3C:4D:13:08:3F:20';
const norm = (s) => String(s || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
const expectedNorm = norm(expected);

async function gql(query, variables) {
  const r = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const buildCredType = await gql(`{
  __type(name: "AndroidAppBuildCredentials") {
    fields { name }
  }
}`);
console.log(
  'BUILD_CRED_FIELDS',
  buildCredType?.data?.__type?.fields?.map((f) => f.name),
);

const data = await gql(
  `
query($id: String!) {
  app {
    byId(appId: $id) {
      id
      fullName
      androidAppCredentials {
        id
        applicationIdentifier
        isLegacy
        androidAppBuildCredentialsList {
          id
          name
          isDefault
          androidKeystore {
            id
            keyAlias
            keystorePassword
            keyPassword
            keystore
            md5CertificateFingerprint
            sha1CertificateFingerprint
            sha256CertificateFingerprint
          }
        }
      }
    }
  }
}`,
  { id: projectId },
);

if (data.errors) {
  console.log('ERR', JSON.stringify(data.errors, null, 2));
  process.exit(1);
}

mkdirSync('secrets', { recursive: true });
let match = null;
for (const appCred of data?.data?.app?.byId?.androidAppCredentials || []) {
  for (const bc of appCred.androidAppBuildCredentialsList || []) {
    const ks = bc.androidKeystore;
    const sha1 = ks?.sha1CertificateFingerprint;
    const isMatch = norm(sha1) === expectedNorm;
    console.log(
      'FOUND',
      appCred.applicationIdentifier,
      bc.name,
      'default=',
      bc.isDefault,
      'SHA1=',
      sha1,
      'MATCH=',
      isMatch,
    );
    if (sha1 && isMatch && !match) {
      match = { appCred, bc, ks };
    }
  }
}

console.log('EXPECTED=', expected);

if (!match?.ks?.keystore) {
  console.log('NO_MATCHING_KEYSTORE_DOWNLOADABLE');
  process.exit(2);
}

const jksPath = resolve('secrets', 'play-upload.jks');
const buf = Buffer.from(match.ks.keystore, 'base64');
writeFileSync(jksPath, buf);
const creds = {
  keystorePath: 'secrets/play-upload.jks',
  keystorePassword: match.ks.keystorePassword,
  keyAlias: match.ks.keyAlias,
  keyPassword: match.ks.keyPassword,
  packageName: 'com.abroadster.myapp',
  sha1: match.ks.sha1CertificateFingerprint,
  sourceApplicationIdentifier: match.appCred.applicationIdentifier,
  sourceCredentialsName: match.bc.name,
};
writeFileSync(
  resolve('secrets', 'android-keystore.credentials.json'),
  JSON.stringify(creds, null, 2) + '\n',
);
console.log('WROTE', jksPath);
console.log('CREDS_OK', {
  alias: creds.keyAlias,
  sha1: creds.sha1,
  from: creds.sourceApplicationIdentifier,
});
