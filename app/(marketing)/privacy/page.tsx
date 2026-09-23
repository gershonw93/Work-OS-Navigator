import { SUPPORT_EMAIL } from '@/lib/support-email'
import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { marketingMeta } from '@/components/marketing/meta'

export const metadata: Metadata = marketingMeta({
  title: 'Privacy Policy · SyteNav',
  description:
    'How SyteNav collects, uses, and protects your information, including project data and documents processed by AI.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="September 23, 2026"
      intro="This Privacy Policy explains how SyteNav ('SyteNav', 'we', 'us') collects, uses, and protects information when you use our website and construction management software (the 'Service'). By using the Service you agree to this policy."
      sections={[
        { h: 'Information we collect', body: ['We collect information you provide directly, such as your name, email, company details, and the project data you enter (quotes, budgets, invoices, logs, documents, photos, and similar).', 'We also collect limited technical information automatically, such as device, browser, IP address, and usage events, to keep the Service secure and reliable.'] },
        { h: 'How we use information', list: ['Provide, maintain, and improve the Service', 'Authenticate users and secure accounts', 'Process transactions and send service-related communications', 'Provide support and respond to requests', 'Detect, prevent, and address fraud, abuse, or technical issues'] },
        { h: 'How we share information', body: ['We do not sell your personal information. We share it only with service providers who help us operate the Service (for example hosting, database, storage, and AI document-processing providers), under contracts that require them to protect it, and when required by law.'] },
        { h: 'AI document processing', body: ['When you upload documents (such as quotes or invoices) for scanning, the file contents may be processed by a third-party AI provider to extract structured data. We send only what is needed to perform the extraction and do not use your data to train third-party models.'] },
        // GOOGLE USER DATA. Google will not verify an app that reads Contacts
        // without this section, and the Limited Use sentence has to appear in
        // Google's own words. Every other sentence here is a fact about the
        // code: read-only scopes (lib/google-contacts.ts GOOGLE_SCOPES), a
        // staging table (migration 112) nothing leaves unless somebody picks
        // it, no AI call anywhere on the path, and Disconnect deleting the
        // stored tokens while leaving the staged list (which is why deleting
        // that list is by request).
        { h: 'Google user data', body: [
          'SyteNav can import contacts from your Google account, if you choose to connect it (Directory > Imported contacts). Each person connects their own account. We ask Google for read-only access to that account\'s contacts and to its email address, and nothing else. We never add, change or delete anything in your Google account.',
          'From each contact we read the name, email address, phone number, company and job title. They are kept in an import list that only you can see - not your colleagues, and not your company\'s admins. A contact is shared with your company only when you add it to your company\'s Directory; the rest stay in your private import list, where you can dismiss them.',
          'We use this data only to show you those contacts and add the ones you choose. We do not sell it, use it for advertising, use it to train AI models, or share it with anyone except the service providers that host SyteNav. Nobody at SyteNav reads it unless you ask us to for support, or the law or a security investigation requires it.',
          'You can disconnect Google at any time from Directory > Imported contacts, which deletes the access we were given. You can also remove SyteNav\'s access from your Google account at myaccount.google.com/permissions. To have the imported contacts deleted as well, see sytenav.com/delete-account or email us.',
          'SyteNav\'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy (developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.',
        ] },
        { h: 'Data storage and security', body: ['Your data is stored with reputable cloud infrastructure providers. We use industry-standard safeguards including encryption in transit and access controls. No method of transmission or storage is 100% secure, but we work to protect your information.'] },
        { h: 'Data retention', body: ['We retain your information for as long as your account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. You may request deletion as described below.'] },
        { h: 'Your rights', body: ['Depending on your location, you may have rights to access, correct, export, or delete your personal information, and to object to or restrict certain processing. To exercise these rights, contact us at the email below.'] },
        { h: 'Cookies', body: ['We use cookies and similar technologies as described in our Cookie Policy.'] },
        { h: 'Children', body: ['The Service is not directed to children under 16, and we do not knowingly collect their personal information.'] },
        { h: 'Changes to this policy', body: ['We may update this policy from time to time. Material changes will be posted here with an updated date.'] },
        { h: 'Contact', body: [`For privacy questions or requests, contact ${SUPPORT_EMAIL}.`] },
      ]}
    />
  )
}
