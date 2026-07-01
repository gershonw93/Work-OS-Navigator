import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'

export const metadata: Metadata = { title: 'Privacy Policy, SyteNav' }

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="July 1, 2026"
      intro="This Privacy Policy explains how SyteNav ('SyteNav', 'we', 'us') collects, uses, and protects information when you use our website and construction management software (the 'Service'). By using the Service you agree to this policy."
      sections={[
        { h: 'Information we collect', body: ['We collect information you provide directly, such as your name, email, company details, and the project data you enter (quotes, budgets, invoices, logs, documents, photos, and similar).', 'We also collect limited technical information automatically, such as device, browser, IP address, and usage events, to keep the Service secure and reliable.'] },
        { h: 'How we use information', list: ['Provide, maintain, and improve the Service', 'Authenticate users and secure accounts', 'Process transactions and send service-related communications', 'Provide support and respond to requests', 'Detect, prevent, and address fraud, abuse, or technical issues'] },
        { h: 'How we share information', body: ['We do not sell your personal information. We share it only with service providers who help us operate the Service (for example hosting, database, storage, and AI document-processing providers), under contracts that require them to protect it, and when required by law.'] },
        { h: 'AI document processing', body: ['When you upload documents (such as quotes or invoices) for scanning, the file contents may be processed by a third-party AI provider to extract structured data. We send only what is needed to perform the extraction and do not use your data to train third-party models.'] },
        { h: 'Data storage and security', body: ['Your data is stored with reputable cloud infrastructure providers. We use industry-standard safeguards including encryption in transit and access controls. No method of transmission or storage is 100% secure, but we work to protect your information.'] },
        { h: 'Data retention', body: ['We retain your information for as long as your account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. You may request deletion as described below.'] },
        { h: 'Your rights', body: ['Depending on your location, you may have rights to access, correct, export, or delete your personal information, and to object to or restrict certain processing. To exercise these rights, contact us at the email below.'] },
        { h: 'Cookies', body: ['We use cookies and similar technologies as described in our Cookie Policy.'] },
        { h: 'Children', body: ['The Service is not directed to children under 16, and we do not knowingly collect their personal information.'] },
        { h: 'Changes to this policy', body: ['We may update this policy from time to time. Material changes will be posted here with an updated date.'] },
        { h: 'Contact', body: ['For privacy questions or requests, contact legal@sytenav.com.'] },
      ]}
    />
  )
}
