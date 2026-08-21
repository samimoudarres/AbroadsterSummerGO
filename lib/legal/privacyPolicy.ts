/**
 * Abroadster Privacy Policy
 * Effective: August 3, 2026
 * Last updated: August 3, 2026
 *
 * Written to reflect the data Abroadster actually collects and processes
 * (accounts, profile, location, photos, chat, trips, notifications via Supabase).
 */

export const PRIVACY_POLICY_TITLE = 'Privacy Policy';

export const PRIVACY_POLICY_EFFECTIVE = 'August 11, 2026';

export const PRIVACY_POLICY_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: '1. Who we are',
    body: `Abroadster ("Abroadster," "we," "us," or "our") provides a mobile and web application that helps students connect around study-abroad communities, trips, messaging, maps, and photo sharing.

Controller / operator: Abroadster
Contact for privacy requests: samimoudarres@hotmail.com
If you have questions about this Policy, email samimoudarres@hotmail.com.`,
  },
  {
    heading: '2. Scope',
    body: `This Privacy Policy explains what information we collect, how we use it, how we share it, and the choices you have when you use the Abroadster apps and related services (the "Service").

By creating an account or using the Service, you agree to this Policy. If you do not agree, do not use the Service.

This Policy is intended to help you understand our practices and to meet transparency expectations for Apple App Store and Google Play listings. It is not legal advice.`,
  },
  {
    heading: '3. Information we collect',
    body: `We collect information in the following categories.

A. Information you provide
• Account & identity: first name, last name, login email or phone number, password (stored by our authentication provider in hashed form), date of birth (to enforce our 13+ age requirement), and optional school (.edu) email used for student verification.
• Profile: home university, study-abroad program, host city and country, semester, bio, and profile photo.
• Content you create: posts (captions, photos, location labels and coordinates you attach), trip details, trip album photos, chat and AirMail messages, polls, reactions, stamps, friend connections, trip invites and join requests, and similar social content.
• Communications: messages you send to support, and information in reports or feedback.

B. Information collected automatically
• Device & app data: device type, operating system, app version, and basic diagnostic information needed to run and secure the Service.
• Usage data: features you use (for example opening chats, trips, map, or notifications), approximate timestamps, and similar interaction logs.
• Push notification tokens: if you allow notifications, we may store a device token to deliver trip, friend, and activity alerts.

C. Location information
• Study-abroad host city and country come from the schools and city you enter on your profile. That is where you “study,” not necessarily where you are standing.
• If you allow When-In-Use location while using the map, we read your device GPS only while the app is open, reverse-geocode it to a city/country label, and show that as your current location on the map and in the nearby list so friends can see where you actually are.
• We store last published live coordinates and city label separately from your host city. We do not request Always / background location.
• You can decline the location prompt; the map still works using your host city / program pin.

D. Photos and camera
• If you grant photo library or camera permission, we access media only when you choose to upload a profile photo, post, chat image, or trip album photo.
• We do not access your full camera roll in the background.

E. Information from service providers
• We use infrastructure providers (for example authentication, database, file storage, maps, and analytics/diagnostics as configured) that process data on our behalf to operate the Service.`,
  },
  {
    heading: '4. How we use information',
    body: `We use personal information to:
• Create and secure your account, verify student status when applicable, and authenticate you.
• Operate core features: community school chats, AirMail, trips, invites, albums, home feed, map, passport/explorer features, friends, and notifications.
• Display your profile and content to other users according to the audience and privacy choices you select in-product.
• Personalize experiences such as school community membership based on the schools you select.
• Maintain safety, prevent fraud and abuse, enforce our Terms, and comply with law.
• Improve reliability and performance (including diagnosing crashes and fixing bugs).
• Communicate with you about the Service, security alerts, and (with consent where required) product updates.

We do not sell your personal information for money. We do not use your content to train third-party foundation models.`,
  },
  {
    heading: '5. How we share information',
    body: `We share information only as described below:

• Other users: profile details and content you post or send (including messages to recipients, trip membership, feed posts, and map presence according to your privacy settings) are visible to other users of the Service as designed. Upcoming trip details are limited to destination city and dates for mutual friends; hotel/flight logistics are not collected. Trip album photos can be limited to trip members when the album is set to private.
• Service providers: vendors that host, store, authenticate, deliver media, provide maps, or send push notifications, under obligations to process data for us (for example our cloud database/auth/storage provider and map providers). These providers process data to operate Abroadster and are not permitted to sell your personal information.
• Legal & safety: when we believe disclosure is required by law, valid legal process, or to protect the rights, safety, or property of Abroadster, our users, or the public.
• Business transfers: if we are involved in a merger, acquisition, financing, or sale of assets, information may be transferred as part of that transaction, subject to this Policy or successor protections.

We do not share your phone number or email with other users by default as a public directory listing, except as needed for features you use (for example showing your name on messages you send). We do not sell personal information.`,
  },
  {
    heading: '6. Data retention',
    body: `We retain account and profile information while your account is active. Content you create may remain visible to others until you delete it or delete your account, subject to backup and legal retention needs.

We may retain limited information after account deletion where required for security, fraud prevention, dispute resolution, or legal compliance (for example logs needed to investigate abuse).

You may delete your account at any time in the app: Profile → menu → Settings → Delete account. You may also request deletion by emailing samimoudarres@hotmail.com or by using our public account-deletion instructions at https://abroadster.vercel.app/delete-account. We will process verified requests within a reasonable period, subject to technical and legal limits.`,
  },
  {
    heading: '7. Safety, reporting, and blocking',
    body: `Abroadster includes tools to help keep the community safe:

• Report: you can report a user from their profile menu, and report posts or album photos from their menus. Reports include a reason and optional details and are reviewed by our team. Content that violates our Terms may be removed.
• Block: you can block a user so they cannot easily find or message you. You can manage blocked accounts in Settings.
• Account deletion: you can permanently delete your account from Settings.

We may remove content, restrict accounts, or take other action when we believe it is needed to enforce our Terms or protect users. If someone is in immediate danger, contact local emergency services.`,
  },
  {
    heading: '8. Security',
    body: `We use industry-standard measures appropriate to the nature of the data, including encrypted transport (HTTPS/TLS), access controls on our backend, and hashed credential storage via our authentication provider.

No method of transmission or storage is 100% secure. You are responsible for keeping your password confidential and for activity on your account.`,
  },
  {
    heading: '9. Children',
    body: `Abroadster is intended for users age 13 and older. We do not knowingly collect personal information from children under 13. If we learn we have collected such information, we will delete it. If you believe a child under 13 has created an account, contact samimoudarres@hotmail.com.`,
  },
  {
    heading: '10. Your choices and rights',
    body: `Depending on where you live, you may have rights to access, correct, delete, or export personal information, or to object to or restrict certain processing.

You can:
• Edit profile information in the app.
• Manage camera, photos, and notification permissions in device settings.
• Block or report other users from their profile menu.
• Delete your account in Settings, or email samimoudarres@hotmail.com.

We will not discriminate against you for exercising privacy rights. We may need to verify your identity before fulfilling a request.`,
  },
  {
    heading: '11. International users',
    body: `Abroadster may be operated from the United States. If you use the Service from another country, you understand that your information may be processed in the United States and other countries where our providers operate, which may have different data-protection rules than your country.`,
  },
  {
    heading: '12. Third-party links and SDKs',
    body: `The Service may use third-party maps, fonts, authentication, storage, and similar SDKs. Those providers have their own privacy practices. We encourage you to review their policies. This Policy covers information processed by Abroadster in connection with the Service.`,
  },
  {
    heading: '13. Changes',
    body: `We may update this Policy from time to time. We will post the updated Policy in the app and update the "Last updated" date. Material changes may also be communicated in-app or by email where appropriate. Continued use after the effective date means you accept the updated Policy.`,
  },
  {
    heading: '14. Contact',
    body: `Privacy questions or requests:
Email: samimoudarres@hotmail.com

Account deletion instructions (web): https://abroadster.vercel.app/delete-account, or Profile → Settings → Delete account in the app.

For App Store / Google Play reviewers: this Privacy Policy is available in-app during account creation and at the Privacy Policy URL listed on the store listing.`,
  },
];

export function privacyPolicyPlainText(): string {
  return [
    `${PRIVACY_POLICY_TITLE}`,
    `Effective / Last updated: ${PRIVACY_POLICY_EFFECTIVE}`,
    '',
    ...PRIVACY_POLICY_SECTIONS.flatMap((s) => [s.heading, s.body, '']),
  ].join('\n');
}
