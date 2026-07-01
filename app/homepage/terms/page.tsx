import type { Metadata } from 'next'
import { LegalDoc } from '@/components/marketing/legal-doc'
import { marketingMeta } from '@/components/marketing/meta'

export const metadata: Metadata = marketingMeta({
  title: 'Terms of Service · SyteNav',
  description:
    'The terms that govern your use of SyteNav, including accounts, billing, your data, and acceptable use.',
  path: '/homepage/terms',
})

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="July 1, 2026"
      intro="These Terms of Service ('Terms') govern your access to and use of SyteNav's website and software (the 'Service'). By creating an account or using the Service, you agree to these Terms."
      sections={[
        { h: 'Accounts', body: ['You must provide accurate information and are responsible for activity under your account and for keeping your credentials secure. You must be authorized to act on behalf of the company you register.'] },
        { h: 'Acceptable use', body: ['You agree to use the Service in compliance with our Acceptable Use Policy and all applicable laws. We may suspend or terminate accounts that violate these Terms.'] },
        { h: 'Your data and content', body: ["You retain all rights to the data and content you submit (“Customer Data”). You grant us a limited license to host, process, and display Customer Data solely to provide and improve the Service."] },
        { h: 'Subscriptions and billing', body: ['Some features may require a paid subscription. Fees, billing cycles, and any free tier or trial will be described at sign-up. Unless stated otherwise, fees are non-refundable except as required by law.'] },
        { h: 'Intellectual property', body: ['The Service, including its software, design, and content (excluding Customer Data), is owned by SyteNav and protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable right to use the Service.'] },
        { h: 'Third-party services', body: ['The Service may integrate with or rely on third-party services (such as hosting, storage, and AI processing). We are not responsible for third-party services and their terms may apply.'] },
        { h: 'Disclaimers', body: ['The Service is provided "as is" and "as available" without warranties of any kind, to the fullest extent permitted by law. We do not warrant that the Service will be uninterrupted, error-free, or fit for a particular purpose.'] },
        { h: 'Limitation of liability', body: ['To the fullest extent permitted by law, SyteNav will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or data. Our total liability for any claim will not exceed the amounts you paid us in the 12 months before the claim.'] },
        { h: 'Termination', body: ['You may stop using the Service at any time. We may suspend or terminate access for violation of these Terms or to protect the Service. On termination, your right to use the Service ends; you may request an export of Customer Data for a limited period.'] },
        { h: 'Governing law', body: ['These Terms are governed by the laws of the State of New Jersey, USA, without regard to its conflict-of-laws rules.'] },
        { h: 'Changes to these Terms', body: ['We may update these Terms from time to time. Material changes will be posted here with an updated date; continued use means you accept the changes.'] },
        { h: 'Contact', body: ['Questions about these Terms? Contact legal@sytenav.com.'] },
      ]}
    />
  )
}
