import { SUPPORT_EMAIL } from '@/lib/support-email'
import type { LegalSection } from '@/components/marketing/legal-doc'

// The Terms of Service, in ONE place. The marketing page renders it, and so
// does the bare copy at /auth/legal/terms that the signup and login screens
// link to (the marketing page carries a Pricing link in its header, which the
// iOS app may not show - CLAUDE.md, Selling).
//
// TERMS_VERSION is what an account agreed to. complete-signup stores it beside
// `terms_accepted_at`, so "which terms did this customer accept" has an answer
// - change the text in a way that matters and bump it.
//
// COPY IS A SPEC HERE TOO. Every statement about what SyteNav does (it does not
// sell data, it does not move money between a GC and their client, a shared
// link opens for whoever holds it) is a fact about the code. A promise the
// product does not keep is worse in a legal document than anywhere else.

export const TERMS_VERSION = '2026-10-22'
export const TERMS_UPDATED = 'October 22, 2026'

export const TERMS_INTRO = "These Terms of Service ('Terms') are an agreement between you and SyteNav ('SyteNav', 'we', 'us') and govern your access to and use of SyteNav's website, web app and mobile apps (the 'Service'). By creating an account, ticking the box at sign-up, or using the Service, you agree to these Terms. If you are using the Service for a company, you agree on its behalf and confirm you have the authority to do so; 'you' then means that company and everyone it lets use the Service. If you do not agree, do not use the Service."

export const TERMS_SECTIONS: LegalSection[] = [
  { h: 'Accounts', body: [
    'You must provide accurate information and keep it up to date. You are responsible for keeping your passwords secure and for everything done under your account, including by the teammates, subcontractors and other people you invite and the permissions you give them.',
    'Tell us promptly at the address below if you believe your account has been accessed without your permission. We are not responsible for loss caused by somebody using your credentials, or by access you or your administrators granted.',
  ] },
  { h: 'Acceptable use', body: ['You agree to use the Service in compliance with our Acceptable Use Policy and all applicable laws. We may suspend or terminate accounts that violate these Terms.'] },
  { h: 'Your data and content', body: [
    "You retain all rights to the data, documents, photos and other content you submit (“Customer Data”). You grant us a limited license to host, copy, process, transmit and display Customer Data only to provide, secure and improve the Service.",
    'You are responsible for your Customer Data: that it is accurate, that you have the right to upload and share it, and that it does not infringe anybody else\'s rights or break any law.',
  ] },
  { h: 'Your data is private, and the links you share are yours to control', body: [
    'We do not publish your Customer Data and we do not sell it. It is visible to the people in your company and to the people you choose to give access to, under the roles and permissions you set.',
    'Some features create links that open without signing in - for example a client portal link, a shared document or report, a bid request or a link sent to a subcontractor. Anybody who has such a link can open what it shows. You decide who receives those links, and you are responsible for forwarding, sharing or posting them. Many of these links can be turned off or replaced in the Service. We are not responsible for what a person you, your team or your client gave a link to does with it.',
  ] },
  { h: 'Back up anything you cannot afford to lose', body: [
    'We take reasonable steps to keep the Service running and your Customer Data safe, but no system is perfect. Data can be lost, damaged, delayed or temporarily unavailable - for example through an outage of our hosting, database or other providers, a software bug, a security incident, an internet or power failure, or an action taken in your own account.',
    'You are responsible for keeping your own copies of any Customer Data that matters to you, including documents, photos, contracts, invoices and financial records. The Service is not a backup service or a system of record for legal, tax or accounting purposes.',
    'To the fullest extent permitted by law, we are not liable for any loss, corruption, deletion, unavailability or delay of Customer Data, or for the cost of recreating it, however it happens.',
  ] },
  { h: 'Availability and changes to the Service', body: [
    'The Service is provided on an "as available" basis. We do not promise that it will always be available, uninterrupted, timely, secure or free of errors, and we offer no uptime or service-level commitment unless we sign a separate written agreement with you that says so.',
    'We may change, suspend or discontinue any part of the Service, including features, integrations and limits, at any time. Parts of the Service may be labelled beta or early access; those are provided for evaluation and may change or stop working.',
  ] },
  { h: 'Notifications, reminders and email', body: [
    'Emails, notifications, reminders and alerts sent by the Service - for example about inspections, deadlines, expiring insurance, schedule changes, approvals or payments - are a convenience. They may be delayed, filtered as spam, not delivered, or not sent at all. Do not rely on them as your only way of tracking a deadline or an obligation. We are not liable for anything that happens because a message was late, missing or wrong.',
  ] },
  { h: 'Not professional advice, and you make the decisions', body: [
    'The Service is a tool for organising construction work. It does not provide engineering, architectural, legal, accounting, tax, insurance, safety or code-compliance advice, and nothing in it is a substitute for a qualified professional.',
    'Schedules, dependency cascades, budgets, totals, progress figures, compliance and expiry statuses, inspection and permit information, and anything the Service calculates or suggests may be incomplete or wrong. You are responsible for checking them and for every decision made on your jobs, including what is built, when, by whom, and whether it meets the plans, the contract and the law.',
  ] },
  { h: 'AI features', body: [
    'Some features use artificial intelligence to read documents you upload (such as bills, quotes, permits and insurance certificates) and to suggest or fill in information. AI output can be inaccurate or incomplete. Review it before saving or relying on it; you are responsible for what you save and send.',
    'If you connect your own AI assistant (such as Claude) to the Service, it acts with your permissions and on your instructions, and you are responsible for what you ask it to do.',
  ] },
  { h: 'Money, invoices and payments', body: [
    'The Service records invoices, bills, payment requests and payments, and can send invoices and requests to your clients. Unless the Service clearly says it is processing a payment, it does not move money between you and your clients, subcontractors or suppliers, and it is not a bank, escrow agent or payment processor for those amounts.',
    'You are responsible for checking every invoice, bill, payment and total before you send, approve or rely on it, and for your contracts and dealings with your clients, subcontractors and suppliers. We are not a party to those contracts and are not responsible for disputes, non-payment, overpayment or errors between you and them.',
  ] },
  { h: 'Subscriptions and billing', body: ['Some features may require a paid subscription. Fees, billing cycles, and any free tier or trial will be described at sign-up. Unless stated otherwise, fees are non-refundable except as required by law. If a subscription is not paid, we may limit the account to read-only access.'] },
  { h: 'Intellectual property', body: ['The Service, including its software, design, and content (excluding Customer Data), is owned by SyteNav and protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable, revocable right to use the Service under these Terms. You may not copy, resell, reverse engineer or build a competing product from the Service.'] },
  { h: 'Third-party services', body: ['The Service relies on and connects to services we do not control, such as hosting, database, storage, email, maps, analytics, AI, payment and accounting providers, and app stores. Their availability, security and accuracy are their responsibility, their own terms may apply to you, and we are not liable for their acts, failures or outages.'] },
  { h: 'QuickBooks Online', body: [
    'If you connect the Service to QuickBooks Online, you confirm that you are authorized to connect the QuickBooks company you choose and to have the Service send records into it. The connection sends records from the Service into QuickBooks. If an administrator turns on bringing changes back, the Service also reads payments, voids, deletions and amount changes made in QuickBooks to records the Service sent, adds those payments to the job and flags the rest for you to review; it does not import other records, it does not reconcile your books, and it is not accounting, tax or bookkeeping advice. You remain responsible for your accounting records and for reviewing what is sent and what comes back.',
    'Your use of QuickBooks is governed by your agreement with Intuit. SyteNav is not affiliated with or endorsed by Intuit. You may disconnect at any time from Settings or from QuickBooks; records already sent stay in QuickBooks.',
  ] },
  { h: 'Security', body: ['We use reasonable technical and organisational safeguards, including encryption in transit and access controls. No method of storage or transmission is completely secure, and we cannot guarantee that unauthorized access, loss or disclosure will never happen. To the fullest extent permitted by law, we are not liable for unauthorized access to Customer Data that was not caused by our gross negligence or willful misconduct.'] },
  { h: 'Disclaimers', body: ['THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY OR UNINTERRUPTED OPERATION, TO THE FULLEST EXTENT PERMITTED BY LAW.'] },
  { h: 'Limitation of liability', body: [
    'TO THE FULLEST EXTENT PERMITTED BY LAW, SYTENAV AND ITS OWNERS, EMPLOYEES, CONTRACTORS AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, BUSINESS, GOODWILL OR DATA, OR ANY COST OF RECREATING DATA, PROJECT DELAYS, CONSTRUCTION DEFECTS, FINES, PENALTIES, OR FAILED OR MISSED INSPECTIONS, PERMITS, DEADLINES OR PAYMENTS, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS, EVEN IF WE WERE TOLD THEY WERE POSSIBLE.',
    'TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED US DOLLARS ($100).',
    'These limits apply whatever the legal theory (contract, tort including negligence, or otherwise) and even if a remedy fails of its essential purpose. Some places do not allow certain exclusions, so some of them may not apply to you.',
  ] },
  { h: 'Indemnification', body: ['You will defend, indemnify and hold harmless SyteNav and its owners, employees and contractors from any claims, losses, damages, liabilities, costs and expenses (including reasonable attorneys\' fees) arising out of your Customer Data, your use of the Service, your jobs and your dealings with your clients, subcontractors and suppliers, the people you invite or share links with, or your breach of these Terms or the law.'] },
  { h: 'Events beyond our control', body: ['We are not responsible for any delay or failure caused by events beyond our reasonable control, including outages or failures of hosting, network, power or third-party providers, cyberattacks, natural disasters, epidemics, war, government action or labour disputes.'] },
  { h: 'Termination', body: ['You may stop using the Service at any time. We may suspend or terminate access for violation of these Terms, non-payment, or to protect the Service or other users. On termination your right to use the Service ends; you may request an export of Customer Data for a limited period, after which we may delete it. Sections that by their nature should survive termination - including those on your data, backups, disclaimers, limitation of liability and indemnification - survive.'] },
  { h: 'Time to bring a claim', body: ['To the fullest extent permitted by law, any claim arising out of or related to the Service or these Terms must be brought within one year after it arose, or it is permanently barred.'] },
  { h: 'Governing law and courts', body: ['These Terms are governed by the laws of the State of New Jersey, USA, without regard to its conflict-of-laws rules. Any dispute will be brought only in the state or federal courts located in New Jersey, and you and we consent to their jurisdiction.'] },
  { h: 'General', body: ['These Terms, together with our Privacy Policy and Acceptable Use Policy, are the entire agreement between you and us about the Service. If any part is found unenforceable, the rest stays in effect and that part is enforced to the maximum extent allowed. Our not enforcing a term is not a waiver of it. You may not transfer these Terms without our consent; we may transfer them as part of a merger, acquisition or sale of assets.'] },
  { h: 'Changes to these Terms', body: ['We may update these Terms from time to time. Material changes will be posted here with an updated date, and we may also tell you in the Service or by email. Continued use after a change takes effect means you accept the updated Terms.'] },
  { h: 'Contact', body: [`Questions about these Terms? Contact ${SUPPORT_EMAIL}.`] },
]
