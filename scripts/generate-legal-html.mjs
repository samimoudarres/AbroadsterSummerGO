import { writeFileSync, mkdirSync } from 'fs';
import { TERMS_OF_USE_SECTIONS, TERMS_OF_USE_TITLE, TERMS_OF_USE_EFFECTIVE } from '../lib/legal/termsOfUse.ts';
import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_TITLE, PRIVACY_POLICY_EFFECTIVE } from '../lib/legal/privacyPolicy.ts';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function page(title, effective, sections, otherHref, otherLabel) {
  const body = sections
    .map(
      (s) =>
        `<h2>${esc(s.heading)}</h2>\n<p>${esc(s.body)}</p>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Abroadster ${esc(title)}</title>
<meta name="description" content="Abroadster ${esc(title)}"/>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#222;max-width:720px;margin:0 auto;padding:24px 18px 64px}
h1{font-size:1.6rem;margin-bottom:.25rem}.meta{color:#666;margin-bottom:1.5rem}
h2{font-size:1.05rem;margin-top:1.4rem}p{white-space:pre-wrap;margin:.4rem 0 0}a{color:#175864}
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p class="meta">Effective / Last updated: ${esc(effective)} · <a href="${otherHref}">${otherLabel}</a> · <a href="mailto:support@abroadster.com">support@abroadster.com</a></p>
${body}
</body>
</html>
`;
}

mkdirSync('public/legal', { recursive: true });
writeFileSync(
  'public/legal/terms.html',
  page(
    TERMS_OF_USE_TITLE,
    TERMS_OF_USE_EFFECTIVE,
    TERMS_OF_USE_SECTIONS,
    './privacy.html',
    'Privacy Policy',
  ),
);
writeFileSync(
  'public/legal/privacy.html',
  page(
    PRIVACY_POLICY_TITLE,
    PRIVACY_POLICY_EFFECTIVE,
    PRIVACY_POLICY_SECTIONS,
    './terms.html',
    'Terms of Use',
  ),
);
writeFileSync(
  'public/legal/index.html',
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Abroadster Legal</title></head><body style="font-family:system-ui;padding:40px;max-width:640px;margin:0 auto"><h1>Abroadster Legal</h1><ul><li><a href="./privacy.html">Privacy Policy</a></li><li><a href="./terms.html">Terms of Use</a></li><li><a href="./delete-account.html">Delete your account</a></li></ul><p><a href="mailto:support@abroadster.com">support@abroadster.com</a></p></body></html>`,
);

writeFileSync(
  'public/legal/delete-account.html',
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Abroadster — Delete your account &amp; data</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#222;max-width:720px;margin:0 auto;padding:24px 18px 64px}
h1{font-size:1.65rem;color:#175864;margin-bottom:0.4rem}
.lead{font-size:1.05rem;margin-top:0}
h2{font-size:1.1rem;margin-top:1.6rem;color:#175864}
a{color:#175864}ol,ul{padding-left:1.2rem}
.box{background:#f3f7f8;border:1px solid #d5e3e6;border-radius:10px;padding:14px 16px;margin:14px 0}
.muted{color:#555;font-size:0.95rem}
</style>
</head>
<body>
<p class="muted">Abroadster · Account deletion</p>
<h1>Delete your Abroadster account and associated data</h1>
<p class="lead">This page is for users of the <strong>Abroadster</strong> mobile app. It explains how to request that your account and associated data be deleted, what is deleted, and what may be retained.</p>
<div class="box">
<strong>App / developer name:</strong> Abroadster<br/>
<strong>Support:</strong> <a href="mailto:support@abroadster.com">support@abroadster.com</a>
</div>
<h2>How to request account deletion (in the app)</h2>
<ol>
<li>Open the <strong>Abroadster</strong> app and sign in with the account you want deleted.</li>
<li>Go to your <strong>Profile</strong> (profile tab).</li>
<li>Tap the menu (⋯) in the top right → <strong>Settings</strong>.</li>
<li>Scroll to <strong>Delete account</strong>, tap it, and confirm.</li>
</ol>
<p>Deletion begins immediately after you confirm in the app.</p>
<h2>How to request account deletion by email</h2>
<ol>
<li>Email <a href="mailto:support@abroadster.com">support@abroadster.com</a> from the email address on your Abroadster account.</li>
<li>Use the subject line: <strong>Delete my Abroadster account</strong>.</li>
<li>Include the name and email associated with the account.</li>
</ol>
<p>We will verify the request and complete deletion within <strong>30 days</strong>.</p>
<h2>Data that is deleted</h2>
<p>When your account is deleted, Abroadster deletes or irreversibly anonymizes data associated with your account, including:</p>
<ul>
<li>Your profile (name, bio, schools, host city, avatar)</li>
<li>Your posts, photos you uploaded for posts, stamps, and tags</li>
<li>Friendships, blocks, trip memberships, and notification preferences tied to your account</li>
<li>Direct-message and community messages you sent (removed or anonymized so your identity is no longer shown)</li>
<li>Account authentication credentials for that login</li>
</ul>
<h2>Data that may be kept, and retention</h2>
<ul>
<li><strong>Messages visible to other users:</strong> Conversation history may remain for other participants with your identity removed or shown as a deleted user, so their chat history is not broken.</li>
<li><strong>Safety / legal records:</strong> Reports you submitted or that concern you, and records we must keep for fraud prevention, security, or legal compliance, may be retained for up to <strong>90 days</strong> (or longer if required by law), then deleted or further anonymized.</li>
<li><strong>Backups:</strong> Encrypted backups may retain residual copies for up to <strong>30 days</strong> before they are purged from rotating backup cycles.</li>
<li><strong>Aggregated analytics:</strong> Non-identifying, aggregated usage statistics (not linked to your account) may be kept.</li>
</ul>
<h2>After deletion</h2>
<p>You will no longer be able to sign in to that Abroadster account. Creating a new account later starts fresh and does not restore deleted data.</p>
<p class="muted"><a href="./privacy.html">Privacy Policy</a> · <a href="./terms.html">Terms of Use</a></p>
</body>
</html>
`,
);
console.log('Wrote public/legal/*.html');
