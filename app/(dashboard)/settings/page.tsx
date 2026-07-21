'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import {
  User, Building2, Users, Shield, Bell, CreditCard, AlertTriangle,
  Check, X, SlidersHorizontal, Plug, Palette, Camera, RefreshCw, Ban, Lock,
  LayoutTemplate,
} from 'lucide-react'
import { PermissionsPanel } from '@/components/settings/permissions-panel'
import { QuickBooksCard } from '@/components/settings/quickbooks-card'
import { LinkedInCard } from '@/components/settings/linkedin-card'
import { ConnectCalendarButton } from '@/components/calendar/connect-calendar'
import { ThemeToggle, useTheme } from '@/components/ui/theme-toggle'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  company_id: string
}

interface Company {
  id: string
  name: string
  type: string
  contact_email: string
  phone: string
  address: string
  license_number: string
  default_payment_terms?: string
  default_billing_mode?: string
  default_retainage_pct?: number
  auto_logout_minutes?: number
}

interface Teammate {
  id: string
  full_name: string
  email: string
  role: string
  status?: string
}

interface PendingInvite {
  id: string
  email: string
  role: string
  status: string
  created_at: string
}

interface NotifState {
  new_invoice: boolean
  invoice_decision: boolean
  rfi_response: boolean
  compliance_expiring: boolean
  new_bid: boolean
  daily_log: boolean
  new_task: boolean
  change_order: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

// `href` items are links to their own page, not inline tabs.
const TABS: { id: string; label: string; icon: React.ElementType; danger?: boolean; href?: string }[] = [
  { id: 'profile',       label: 'Profile',       icon: User },
  { id: 'company',       label: 'Company',        icon: Building2 },
  { id: 'team',          label: 'Team & Users',   icon: Users },
  { id: 'permissions',   label: 'Permissions',    icon: Shield },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  { id: 'preferences',   label: 'Preferences',    icon: SlidersHorizontal },
  { id: 'security',      label: 'Security',       icon: Lock },
  { id: 'billing',       label: 'Billing',        icon: CreditCard },
  { id: 'integrations',  label: 'Integrations',   icon: Plug },
  { id: 'budget-templates', label: 'Budget Templates', icon: LayoutTemplate, href: '/budget-templates' },
  { id: 'danger',        label: 'Danger Zone',    icon: AlertTriangle, danger: true },
]

const ROLES = [
  { value: 'admin',            label: 'Admin',            desc: 'Full access, can manage users and settings' },
  { value: 'project_manager',  label: 'Project Manager',  desc: 'Can create/edit projects, tasks, RFIs, daily logs' },
  { value: 'field_supervisor', label: 'Field Supervisor', desc: 'Can submit daily logs, view tasks, update progress' },
  { value: 'office_staff',     label: 'Office Staff',     desc: 'Can view projects, submit invoices, manage compliance docs' },
  { value: 'read_only',        label: 'Field Worker',     desc: 'Sees only assigned projects and tasks; view-only access' },
]

const ROLE_COLORS: Record<string, string> = {
  admin:            'bg-special-tint text-special',
  project_manager:  'bg-info-tint text-info',
  field_supervisor: 'bg-accent-tint text-accent-fg',
  office_staff:     'bg-muted text-ink-soft',
  read_only:        'bg-gray-100 text-gray-600',
}

const PERMISSION_MATRIX = [
  { feature: 'Projects',      admin: true,  project_manager: true,  field_supervisor: false, office_staff: true,  read_only: true  },
  { feature: 'Daily Logs',    admin: true,  project_manager: true,  field_supervisor: true,  office_staff: false, read_only: true  },
  { feature: 'Tasks',         admin: true,  project_manager: true,  field_supervisor: true,  office_staff: false, read_only: true  },
  { feature: 'RFIs',          admin: true,  project_manager: true,  field_supervisor: false, office_staff: false, read_only: true  },
  { feature: 'Invoices',      admin: true,  project_manager: false, field_supervisor: false, office_staff: true,  read_only: true  },
  { feature: 'Bids',          admin: true,  project_manager: true,  field_supervisor: false, office_staff: false, read_only: true  },
  { feature: 'Change Orders', admin: true,  project_manager: true,  field_supervisor: false, office_staff: false, read_only: true  },
  { feature: 'Compliance',    admin: true,  project_manager: false, field_supervisor: false, office_staff: true,  read_only: true  },
  { feature: 'Team',          admin: true,  project_manager: false, field_supervisor: false, office_staff: false, read_only: false },
  { feature: 'Financials',    admin: true,  project_manager: false, field_supervisor: false, office_staff: false, read_only: false },
  { feature: 'Settings',      admin: true,  project_manager: false, field_supervisor: false, office_staff: false, read_only: false },
]

const NOTIF_ITEMS: { key: keyof NotifState; label: string }[] = [
  { key: 'new_invoice',         label: 'New invoice submitted' },
  { key: 'invoice_decision',    label: 'Invoice approved / rejected' },
  { key: 'rfi_response',        label: 'RFI response received' },
  { key: 'compliance_expiring', label: 'Compliance document expiring' },
  { key: 'new_bid',             label: 'New bid received' },
  { key: 'daily_log',           label: 'Daily log submitted' },
  { key: 'new_task',            label: 'New task assigned' },
  { key: 'change_order',        label: 'Change order created' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

function RoleBadge({ role, label }: { role: string; label?: string }) {
  const colors = ROLE_COLORS[role] ?? 'bg-muted text-ink-soft'
  const text = label ?? ROLES.find((r) => r.value === role)?.label ?? role
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}>
      {text}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(true)

  // Open a specific tab when linked with ?tab= (e.g. the QuickBooks OAuth callback).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && TABS.some(t => t.id === tab && !t.href)) setActiveTab(tab)
  }, [])
  const [userRole, setUserRole] = useState<string>('')

  // Profile
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  // Company
  const [company, setCompany] = useState<Company | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [address, setAddress] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('')
  const [defaultBillingMode, setDefaultBillingMode] = useState<'simple' | 'aia'>('simple')
  const [autoLogout, setAutoLogout] = useState('0')
  const [autoLogoutSaving, setAutoLogoutSaving] = useState(false)
  const [autoLogoutMsg, setAutoLogoutMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [defaultRetainage, setDefaultRetainage] = useState('10')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [companySaving, setCompanySaving] = useState(false)
  const [companyMsg, setCompanyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Delete protection (secret key)
  const [dpEnabled, setDpEnabled] = useState(false)
  const [dpKeySet, setDpKeySet] = useState(false)
  const [dpKey, setDpKey] = useState('')
  const [dpSaving, setDpSaving] = useState(false)
  const [dpMsg, setDpMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Team
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({})
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')
  const [inviteRole, setInviteRole] = useState('read_only')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Custom classes (company_roles) - merged into role pickers alongside the
  // built-in roles, and used to show friendly labels for custom role keys.
  const [customRoles, setCustomRoles] = useState<{ role_key: string; label: string }[]>([])
  const loadCustomRoles = useCallback(async () => {
    const headers = await authHeaders()
    const res = await fetch('/api/settings/roles', { headers })
    if (res.ok) {
      const data = await res.json()
      setCustomRoles(((data.roles ?? []) as any[]).filter(r => r.is_custom).map(r => ({ role_key: r.role_key, label: r.label })))
    }
  }, [])
  const roleOptions = [...ROLES, ...customRoles.map(r => ({ value: r.role_key, label: r.label, desc: 'Custom class' }))]
  const roleLabel = (role: string) => roleOptions.find(r => r.value === role)?.label ?? role

  // Notifications
  const [notifState, setNotifState] = useState<NotifState>({
    new_invoice: true,
    invoice_decision: true,
    rfi_response: true,
    compliance_expiring: true,
    new_bid: false,
    daily_log: false,
    new_task: true,
    change_order: false,
  })

  // Preferences (localStorage)
  const [prefDefaultType, setPrefDefaultType] = useState('residential')
  const [prefStartOffset, setPrefStartOffset] = useState('today')
  const [prefEnableBulk, setPrefEnableBulk] = useState(true)
  const [prefAddressIncrement, setPrefAddressIncrement] = useState(1)
  const [prefNamingPattern, setPrefNamingPattern] = useState('prefix_number')
  const [prefMaxUnits, setPrefMaxUnits] = useState(50)
  const [prefRequireCustomer, setPrefRequireCustomer] = useState(false)
  const [prefShowCustomerCol, setPrefShowCustomerCol] = useState(true)
  const [prefSaved, setPrefSaved] = useState(false)

  // Danger Zone
  const [dangerInput, setDangerInput] = useState('')
  const [dangerStep, setDangerStep] = useState<'idle' | 'confirm' | 'deleting' | 'done'>('idle')
  const [dangerMsg, setDangerMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadTeammates = useCallback(async () => {
    // Use API (service role) so RLS doesn't block seeing other company members
    const headers = await authHeaders()
    const res = await fetch('/api/settings/teammates', { headers })
    if (res.ok) {
      const data = await res.json()
      if (data.teammates) setTeammates(data.teammates)
      if (data.pendingInvites) setPendingInvites(data.pendingInvites)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Use API as primary - it auto-creates profile if missing and uses service role
      const headers = await authHeaders()
      const res = await fetch('/api/settings', { headers })
      if (res.ok) {
        const data = await res.json()
        const p = data.profile
        const c = data.company

        if (p) {
          const resolvedName = p.full_name || user.user_metadata?.full_name || ''
          const resolvedEmail = p.email || user.email || ''
          setProfile({ ...p, full_name: resolvedName, email: resolvedEmail })
          setUserRole(p.role ?? 'read_only')
          setFullName(resolvedName)
          setProfilePhone(p.phone ?? '')
        } else {
          // Profile row missing even after API - set role from auth metadata so tabs appear
          const metaRole = user.user_metadata?.role ?? 'read_only'
          setUserRole(metaRole)
          setFullName(user.user_metadata?.full_name ?? '')
          setProfile({
            id: user.id,
            full_name: user.user_metadata?.full_name ?? '',
            email: user.email ?? '',
            phone: '',
            role: metaRole,
            company_id: user.user_metadata?.company_id ?? '',
          })
        }

        if (c) {
          setCompany(c)
          setCompanyName(c.name ?? '')
          setCompanyType(c.type ?? '')
          setContactEmail(c.contact_email ?? '')
          setCompanyPhone(c.phone ?? '')
          setAddress(c.address ?? '')
          setLicenseNumber(c.license_number ?? '')
          setDefaultPaymentTerms(c.default_payment_terms ?? '')
          setDefaultBillingMode(c.default_billing_mode === 'aia' ? 'aia' : 'simple')
          setAutoLogout(c.auto_logout_minutes != null ? String(c.auto_logout_minutes) : '0')
          setDefaultRetainage(c.default_retainage_pct != null ? String(c.default_retainage_pct) : '10')
          setLogoUrl(c.logo_url ?? null)
        }

        if (data.deleteProtection) { setDpEnabled(!!data.deleteProtection.enabled); setDpKeySet(!!data.deleteProtection.keySet) }

        if (data.pendingInvites) setPendingInvites(data.pendingInvites)
      } else {
        // API failed - fall back to auth metadata so we're never stuck blank
        const metaRole = user.user_metadata?.role ?? 'admin'
        setUserRole(metaRole)
        setFullName(user.user_metadata?.full_name ?? '')
        setProfile({
          id: user.id,
          full_name: user.user_metadata?.full_name ?? '',
          email: user.email ?? '',
          phone: '',
          role: metaRole,
          company_id: user.user_metadata?.company_id ?? '',
        })
      }
    } catch {
      // Last resort - don't stay blank
      setUserRole('read_only')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
    loadTeammates()
    loadCustomRoles()
    // Load preferences from localStorage
    try {
      const raw = localStorage.getItem('workos_preferences')
      if (raw) {
        const p = JSON.parse(raw)
        if (p.defaultType) setPrefDefaultType(p.defaultType)
        if (p.startOffset) setPrefStartOffset(p.startOffset)
        if (p.enableBulk !== undefined) setPrefEnableBulk(p.enableBulk)
        if (p.addressIncrement) setPrefAddressIncrement(p.addressIncrement)
        if (p.namingPattern) setPrefNamingPattern(p.namingPattern)
        if (p.maxUnits) setPrefMaxUnits(p.maxUnits)
        if (p.requireCustomer !== undefined) setPrefRequireCustomer(p.requireCustomer)
        if (p.showCustomerCol !== undefined) setPrefShowCustomerCol(p.showCustomerCol)
      }
    } catch {
      // ignore
    }
  }, [loadSettings])

  function savePreferences() {
    const prefs = {
      defaultType: prefDefaultType,
      startOffset: prefStartOffset,
      enableBulk: prefEnableBulk,
      addressIncrement: prefAddressIncrement,
      namingPattern: prefNamingPattern,
      maxUnits: prefMaxUnits,
      requireCustomer: prefRequireCustomer,
      showCustomerCol: prefShowCustomerCol,
    }
    localStorage.setItem('workos_preferences', JSON.stringify(prefs))
    setPrefSaved(true)
    setTimeout(() => setPrefSaved(false), 2000)
  }

  // ── Profile Save ──────────────────────────────────────────────────────────

  async function saveProfile() {
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ full_name: fullName, phone: profilePhone }),
      })
      setProfileMsg(res.ok ? { ok: true, text: 'Profile saved.' } : { ok: false, text: 'Failed to save.' })
    } catch {
      setProfileMsg({ ok: false, text: 'Network error.' })
    } finally {
      setProfileSaving(false)
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: 'Passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: 'Password must be at least 8 characters.' })
      return
    }
    setPwSaving(true)
    setPwMsg(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPwMsg({ ok: true, text: 'Password updated.' })
      setNewPassword('')
      setConfirmPassword('')
      setShowPwForm(false)
    } catch (e: unknown) {
      setPwMsg({ ok: false, text: (e as Error).message ?? 'Failed to update password.' })
    } finally {
      setPwSaving(false)
    }
  }

  // ── Company Save ──────────────────────────────────────────────────────────

  async function saveCompany() {
    setCompanySaving(true)
    setCompanyMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          company: {
            name: companyName,
            type: companyType,
            contact_email: contactEmail,
            phone: companyPhone,
            address,
            license_number: licenseNumber,
            default_payment_terms: defaultPaymentTerms,
            default_billing_mode: defaultBillingMode,
            default_retainage_pct: Number(defaultRetainage) || 0,
          },
        }),
      })
      setCompanyMsg(res.ok ? { ok: true, text: 'Company saved.' } : { ok: false, text: 'Failed to save.' })
    } catch {
      setCompanyMsg({ ok: false, text: 'Network error.' })
    } finally {
      setCompanySaving(false)
    }
  }

  // ── Company logo ───────────────────────────────────────────────────────────

  async function uploadLogo(file: File) {
    setLogoUploading(true); setLogoMsg(null)
    try {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const form = new FormData(); form.append('file', file)
      const res = await fetch('/api/settings/logo', {
        method: 'POST', headers: { Authorization: `Bearer ${data?.session?.access_token ?? ''}` }, body: form,
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setLogoUrl(d.logo_url); setLogoMsg({ ok: true, text: 'Logo saved.' }) }
      else setLogoMsg({ ok: false, text: d.error ?? 'Upload failed.' })
    } catch { setLogoMsg({ ok: false, text: 'Network error.' }) }
    finally { setLogoUploading(false) }
  }

  async function removeLogo() {
    const headers = await authHeaders()
    const res = await fetch('/api/settings/logo', { method: 'DELETE', headers })
    if (res.ok) { setLogoUrl(null); setLogoMsg({ ok: true, text: 'Logo removed.' }) }
  }

  // ── Delete protection ──────────────────────────────────────────────────────

  async function saveDeleteProtection() {
    setDpSaving(true); setDpMsg(null)
    try {
      // Requiring protection with no key yet (and none on file) is invalid.
      if (dpEnabled && !dpKeySet && !dpKey.trim()) {
        setDpMsg({ ok: false, text: 'Set a key before turning protection on.' }); setDpSaving(false); return
      }
      const headers = await authHeaders()
      const payload: any = { enabled: dpEnabled }
      if (dpKey.trim()) payload.key = dpKey.trim()
      const res = await fetch('/api/settings', { method: 'PATCH', headers, body: JSON.stringify({ delete_protection: payload }) })
      if (res.ok) {
        if (dpKey.trim()) setDpKeySet(true)
        setDpKey('')
        setDpMsg({ ok: true, text: 'Delete protection saved.' })
      } else {
        setDpMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? 'Failed to save.' })
      }
    } catch {
      setDpMsg({ ok: false, text: 'Network error.' })
    } finally {
      setDpSaving(false)
    }
  }

  // ── Invite ────────────────────────────────────────────────────────────────

  async function sendInvite() {
    if (!inviteEmail || !inviteRole) return
    setInviteSending(true)
    setInviteMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteFullName,
          role: inviteRole,
          company_id: profile?.company_id,
        }),
      })
      if (res.ok) {
        const d = await res.json().catch(() => ({}))
        setInviteMsg({
          ok: true,
          text: d.emailSent === false
            ? `Recorded! ${d.note ?? 'Email may not have been sent - check Supabase email limits.'}`
            : 'Invite sent! They will receive an email to set up their account.',
        })
        setInviteEmail('')
        setInviteFullName('')
        setInviteRole('read_only')
        await loadSettings()
      } else {
        const d = await res.json().catch(() => ({}))
        setInviteMsg({ ok: false, text: d.error ?? 'Failed to send invite.' })
      }
    } catch {
      setInviteMsg({ ok: false, text: 'Network error.' })
    } finally {
      setInviteSending(false)
    }
  }

  // ── Role Change ───────────────────────────────────────────────────────────

  async function changeRole(memberId: string, newRole: string) {
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/settings/members/${memberId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: newRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setTeammates((prev) =>
          prev.map((t) => (t.id === memberId ? { ...t, role: data.role ?? newRole } : t))
        )
      } else {
        alert(`Failed to update role: ${data.error ?? res.statusText}`)
        // Reload to show actual DB state
        loadTeammates()
      }
    } catch {
      alert('Network error - role not saved.')
      loadTeammates()
    }
  }

  // ── Remove Member ─────────────────────────────────────────────────────────

  async function removeMember(memberId: string, name: string) {
    if (!window.confirm(`Remove ${name} from the team? This cannot be undone.`)) return
    try {
      const headers = await authHeaders()
      await fetch(`/api/settings/members/${memberId}`, {
        method: 'DELETE',
        headers,
      })
      setTeammates((prev) => prev.filter((t) => t.id !== memberId))
    } catch {
      // fail silently
    }
  }

  // ── Resend Invite ─────────────────────────────────────────────────────────

  async function resendInvite(email: string, role: string) {
    try {
      const headers = await authHeaders()
      await fetch('/api/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, role }),
      })
      setInviteMsg({ ok: true, text: `Invite resent to ${email}` })
      setTimeout(() => setInviteMsg(null), 3000)
    } catch {
      setInviteMsg({ ok: false, text: 'Failed to resend invite.' })
    }
  }

  // ── Cancel Invite ─────────────────────────────────────────────────────────

  async function cancelInvite(inviteId: string) {
    if (!window.confirm('Cancel this invite?')) return
    try {
      const headers = await authHeaders()
      await fetch(`/api/invite/${inviteId}`, { method: 'DELETE', headers })
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch {
      // fail silently
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async function toggleNotif(key: keyof NotifState, value: boolean) {
    setNotifState((prev) => ({ ...prev, [key]: value }))
    try {
      const headers = await authHeaders()
      await fetch('/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ notifications: { [key]: value } }),
      })
    } catch {
      setNotifState((prev) => ({ ...prev, [key]: !value }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-faint text-sm">
        Loading settings…
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-ink mb-6">Settings</h1>

      <div className="flex gap-6">
        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <nav className="shrink-0 w-14 md:w-52">
          <ul className="space-y-1">
            {TABS.filter(({ id }) => {
              // Don't render gated tabs until role is confirmed
              if (!userRole) return id === 'profile'
              const isAdmin = userRole === 'admin'
              const isManager = isAdmin || userRole === 'project_manager' || userRole === 'manager' || userRole === 'office_staff'
              const isRestricted = ['field_supervisor', 'worker', 'member', 'read_only'].includes(userRole)
              // Restricted users: only Profile and Notifications
              if (isRestricted) return id === 'profile' || id === 'notifications'
              if (id === 'team' || id === 'permissions' || id === 'billing' || id === 'danger' || id === 'security') return isAdmin
              if (id === 'company' || id === 'budget-templates') return isManager
              return true
            }).map(({ id, label, icon: Icon, danger, href }) => {
              // Budget Templates lives on its own page, so it's a link, not a tab.
              if (href) {
                return (
                  <li key={id}>
                    <Link
                      href={href}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors rounded-lg text-muted-fg hover:bg-surface"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="hidden md:block">{label}</span>
                    </Link>
                  </li>
                )
              }
              const active = activeTab === id
              return (
                <li key={id}>
                  <button
                    onClick={() => setActiveTab(id)}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                      active && !danger ? 'rounded-r-lg border-l-4 border-accent bg-accent-tint text-accent-fg pl-2' : '',
                      active && danger  ? 'rounded-r-lg border-l-4 border-danger bg-danger-tint text-danger pl-2' : '',
                      !active && !danger ? 'rounded-lg text-muted-fg hover:bg-surface' : '',
                      !active && danger  ? 'rounded-lg text-danger hover:bg-danger-tint' : '',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="hidden md:block">{label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* ══════════════════════════════════════ TAB: PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Your Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={profile?.email ?? ''}
                        readOnly
                        disabled
                        className="mt-1 bg-surface cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <Label htmlFor="profilePhone">Phone</Label>
                      <Input
                        id="profilePhone"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <div className="mt-2">
                        <RoleBadge role={profile?.role ?? ''} label={roleLabel(profile?.role ?? '')} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={saveProfile} disabled={profileSaving}>
                      {profileSaving ? 'Saving…' : 'Save Profile'}
                    </Button>
                    {profileMsg && (
                      <span className={`text-sm ${profileMsg.ok ? 'text-success' : 'text-danger'}`}>
                        {profileMsg.text}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Appearance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4 text-accent-fg" /> Appearance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink">Theme</p>
                      <p className="text-xs text-muted-fg mt-0.5">
                        Currently {theme === 'dark' ? 'dark' : 'light'} mode. Switch anytime.
                      </p>
                    </div>
                    <ThemeToggle className="border border-line" />
                  </div>
                </CardContent>
              </Card>

              {/* Password */}
              <Card>
                <CardHeader>
                  <CardTitle>Password</CardTitle>
                </CardHeader>
                <CardContent>
                  {!showPwForm ? (
                    <Button variant="outline" onClick={() => setShowPwForm(true)}>
                      Change Password
                    </Button>
                  ) : (
                    <div className="space-y-4 max-w-sm">
                      <div>
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Button onClick={changePassword} disabled={pwSaving}>
                          {pwSaving ? 'Updating…' : 'Update Password'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setShowPwForm(false); setPwMsg(null) }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {pwMsg && (
                        <p className={`text-sm ${pwMsg.ok ? 'text-success' : 'text-danger'}`}>
                          {pwMsg.text}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-fg mb-3">Add your schedules, task due dates, and inspections to your own Google, Apple, or Outlook calendar. It's read-only and optional - SyteNav's calendar still works without it.</p>
                  <ConnectCalendarButton />
                </CardContent>
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: COMPANY */}
          {activeTab === 'company' && (
            <Card>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!company ? (
                  <p className="text-muted-fg text-sm">No company linked to your account.</p>
                ) : (
                  <>
                    {/* Company logo - stamped on PDFs (daily logs, invoices, reports) */}
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-xl border border-line bg-surface flex items-center justify-center overflow-hidden shrink-0">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
                        ) : (
                          <Camera className="h-5 w-5 text-faint" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-soft">Company logo</p>
                        <p className="text-xs text-faint">PNG or JPG, up to 2MB. Appears on downloaded PDFs: daily logs, invoices, and reports.</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="sr-only"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
                          <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                            className="text-sm font-medium text-accent-fg hover:underline disabled:opacity-50">
                            {logoUploading ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo'}
                          </button>
                          {logoUrl && !logoUploading && (
                            <button type="button" onClick={removeLogo} className="text-sm text-muted-fg hover:text-danger">Remove</button>
                          )}
                          {logoMsg && <span className={`text-xs ${logoMsg.ok ? 'text-success' : 'text-danger'}`}>{logoMsg.text}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyType">Company Type</Label>
                        <SearchableSelect
                          id="companyType"
                          value={companyType}
                          onChange={(e) => setCompanyType(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="">Select type…</option>
                          <option value="general_contractor">General Contractor</option>
                          <option value="subcontractor">Subcontractor</option>
                          <option value="owner">Owner</option>
                          <option value="architect">Architect / Designer</option>
                          <option value="engineer">Engineer</option>
                          <option value="other">Other</option>
                        </SearchableSelect>
                      </div>
                      <div>
                        <Label htmlFor="contactEmail">Contact Email</Label>
                        <Input
                          id="contactEmail"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input
                          id="companyPhone"
                          value={companyPhone}
                          onChange={(e) => setCompanyPhone(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="address">Address</Label>
                        <Input
                          id="address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="licenseNumber">License Number</Label>
                        <Input
                          id="licenseNumber"
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="defaultPaymentTerms">Default payment terms</Label>
                      <textarea
                        id="defaultPaymentTerms"
                        rows={2}
                        value={defaultPaymentTerms}
                        onChange={(e) => setDefaultPaymentTerms(e.target.value)}
                        placeholder="e.g. 50% deposit, 40% at rough-in, 10% on completion"
                        className="mt-1 w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
                      />
                      <p className="text-xs text-faint mt-1">Auto-fills on new quotes when the quote doesn't specify terms.</p>
                    </div>
                    <div>
                      <Label>Default billing method for new projects</Label>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button type="button" onClick={() => setDefaultBillingMode('simple')}
                          className={`rounded-lg border px-3 py-2 text-left text-sm ${defaultBillingMode === 'simple' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft'}`}>
                          <span className="font-semibold">Simple invoicing</span>
                          <span className="block text-xs text-muted-fg">Invoices + client payments</span>
                        </button>
                        <button type="button" onClick={() => setDefaultBillingMode('aia')}
                          className={`rounded-lg border px-3 py-2 text-left text-sm ${defaultBillingMode === 'aia' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft'}`}>
                          <span className="font-semibold">Progress billing (AIA)</span>
                          <span className="block text-xs text-muted-fg">Pay applications + retainage</span>
                        </button>
                      </div>
                      {defaultBillingMode === 'aia' && (
                        <div className="flex items-center gap-2 mt-2">
                          <Label className="text-sm font-normal text-muted-fg">Default retainage</Label>
                          <Input type="number" step="0.1" value={defaultRetainage} onChange={(e) => setDefaultRetainage(e.target.value)} className="w-24" />
                          <span className="text-sm text-muted-fg">%</span>
                        </div>
                      )}
                      <p className="text-xs text-faint mt-1">New projects start with this. You can still change it per job.</p>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <Button onClick={saveCompany} disabled={companySaving}>
                        {companySaving ? 'Saving…' : 'Save Company'}
                      </Button>
                      {companyMsg && (
                        <span className={`text-sm ${companyMsg.ok ? 'text-success' : 'text-danger'}`}>
                          {companyMsg.text}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════ TAB: TEAM */}
          {activeTab === 'team' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-ink">Team Members</h2>
                {userRole === 'admin' && (
                  <Button onClick={() => { setShowInvite(true); setInviteMsg(null) }}>
                    + Invite User
                  </Button>
                )}
              </div>

              <Card>
                <CardContent className="p-0">
                  {teammates.length === 0 ? (
                    <p className="text-muted-fg text-sm p-6">No team members yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-line-soft bg-surface">
                            <th className="text-left px-4 py-3 font-medium text-muted-fg">Member</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-fg">Email</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-fg">Role</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-fg">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-fg">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teammates.map((t) => {
                            const isSelf = t.id === profile?.id
                            return (
                            <tr key={t.id} className="border-b border-line-soft last:border-0 hover:bg-surface/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-accent-tint text-accent-fg flex items-center justify-center text-xs font-bold shrink-0">
                                    {initials(t.full_name ?? t.email ?? '?')}
                                  </div>
                                  <div>
                                    <span className="font-medium text-ink-soft">{t.full_name || '-'}</span>
                                    {isSelf && <span className="ml-2 text-xs text-faint">(you)</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-fg">{t.email}</td>
                              <td className="px-4 py-3">
                                {userRole === 'admin' && !isSelf ? (
                                  <div className="flex items-center gap-2">
                                    <SearchableSelect
                                      value={pendingRoles[t.id] ?? t.role}
                                      onChange={(e) => setPendingRoles(prev => ({ ...prev, [t.id]: e.target.value }))}
                                      className="rounded border border-line px-2 py-1 text-xs bg-panel focus:outline-none focus:ring-1 focus:ring-accent"
                                    >
                                      {roleOptions.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                      ))}
                                    </SearchableSelect>
                                    {pendingRoles[t.id] && pendingRoles[t.id] !== t.role && (
                                      <button
                                        onClick={() => {
                                          changeRole(t.id, pendingRoles[t.id])
                                          setPendingRoles(prev => { const n = { ...prev }; delete n[t.id]; return n })
                                        }}
                                        className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-ink hover:bg-accent"
                                      >
                                        Save
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <RoleBadge role={t.role} label={roleLabel(t.role)} />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                  ${t.status === 'pending'
                                    ? 'bg-warn-tint text-warn'
                                    : 'bg-success-tint text-success'
                                  }`}>
                                  {t.status === 'pending' ? 'Pending' : 'Active'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {userRole === 'admin' && !isSelf && (
                                  <button
                                    onClick={() => removeMember(t.id, t.full_name ?? t.email)}
                                    className="text-xs text-danger hover:text-danger hover:underline"
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                            )
                          })}

                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pending Invites */}
              {pendingInvites.length > 0 && (
                <Card className="mt-4">
                  <CardHeader><CardTitle className="text-base">Pending Invites</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line-soft bg-surface">
                          <th className="text-left px-4 py-3 font-medium text-muted-fg">Email</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-fg">Role</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-fg">Sent</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-fg">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingInvites.map((inv) => (
                          <tr key={inv.id} className="border-b border-line-soft last:border-0 hover:bg-surface/50">
                            <td className="px-4 py-3 text-ink-soft">{inv.email}</td>
                            <td className="px-4 py-3"><RoleBadge role={inv.role} label={roleLabel(inv.role)} /></td>
                            <td className="px-4 py-3 text-muted-fg text-xs">{new Date(inv.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warn-tint text-warn">
                                  Pending
                                </span>
                                <button
                                  onClick={() => resendInvite(inv.email, inv.role)}
                                  className="text-xs text-info hover:text-info hover:underline flex items-center gap-1"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Resend
                                </button>
                                <button
                                  onClick={() => cancelInvite(inv.id)}
                                  className="text-xs text-danger hover:text-danger hover:underline flex items-center gap-1"
                                >
                                  <Ban className="h-3 w-3" />
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Inline message for resend/cancel feedback */}
              {inviteMsg && !showInvite && (
                <p className={`mt-3 text-sm ${inviteMsg.ok ? 'text-success' : 'text-danger'}`}>
                  {inviteMsg.text}
                </p>
              )}

              {/* Invite Modal */}
              {showInvite && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-panel rounded-xl shadow-xl w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-lg font-semibold text-ink">Invite Team Member</h3>
                      <button
                        onClick={() => setShowInvite(false)}
                        className="text-faint hover:text-muted-fg"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="inviteFullName">Full Name</Label>
                        <Input
                          id="inviteFullName"
                          value={inviteFullName}
                          onChange={(e) => setInviteFullName(e.target.value)}
                          placeholder="Jane Smith"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="inviteEmail">Email Address</Label>
                        <Input
                          id="inviteEmail"
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="jane@example.com"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="inviteRole">Role</Label>
                        <SearchableSelect
                          id="inviteRole"
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          {roleOptions.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </SearchableSelect>
                        {inviteRole && (
                          <p className="mt-1.5 text-xs text-muted-fg">
                            {roleOptions.find((r) => r.value === inviteRole)?.desc}
                          </p>
                        )}
                      </div>

                      {inviteMsg && (
                        <p className={`text-sm ${inviteMsg.ok ? 'text-success' : 'text-danger'}`}>
                          {inviteMsg.text}
                        </p>
                      )}

                      <div className="flex gap-3 pt-1">
                        <Button
                          onClick={sendInvite}
                          disabled={inviteSending || !inviteEmail}
                          className="flex-1"
                        >
                          {inviteSending ? 'Sending…' : 'Send Invite'}
                        </Button>
                        <Button variant="outline" onClick={() => setShowInvite(false)} className="flex-1">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════ TAB: PERMISSIONS */}
          {activeTab === 'permissions' && (
            <Card>
              <CardHeader>
                <CardTitle>Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <PermissionsPanel teammates={teammates as any} onRolesChanged={loadCustomRoles} />
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════ TAB: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {NOTIF_ITEMS.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-3 border-b border-line-soft last:border-0"
                  >
                    <span className="text-sm text-ink-soft">{label}</span>
                    <button
                      onClick={() => toggleNotif(key, !notifState[key])}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
                        ${notifState[key] ? 'bg-accent' : 'bg-muted2'}`}
                      role="switch"
                      aria-checked={notifState[key]}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition-transform
                          ${notifState[key] ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════ TAB: PREFERENCES */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              {/* Project Defaults */}
              <Card>
                <CardHeader>
                  <CardTitle>Project Defaults</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pref-type">Default Project Type</Label>
                      <SearchableSelect
                        id="pref-type"
                        value={prefDefaultType}
                        onChange={(e) => setPrefDefaultType(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="renovation">Renovation</option>
                        <option value="mixed_use">Mixed Use</option>
                      </SearchableSelect>
                    </div>
                    <div>
                      <Label htmlFor="pref-offset">Default Start Date Offset</Label>
                      <SearchableSelect
                        id="pref-offset"
                        value={prefStartOffset}
                        onChange={(e) => setPrefStartOffset(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <option value="today">Today</option>
                        <option value="1week">1 week out</option>
                        <option value="2weeks">2 weeks out</option>
                        <option value="1month">1 month out</option>
                      </SearchableSelect>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bulk Creation Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Bulk Creation Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink-soft">Enable Bulk Creation</p>
                      <p className="text-xs text-muted-fg mt-0.5">Show bulk creation options in the UI</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefEnableBulk((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${prefEnableBulk ? 'bg-accent' : 'bg-muted2'}`}
                      role="switch"
                      aria-checked={prefEnableBulk}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition-transform ${prefEnableBulk ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pref-naming">Default Naming Pattern</Label>
                      <SearchableSelect
                        id="pref-naming"
                        value={prefNamingPattern}
                        onChange={(e) => setPrefNamingPattern(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <option value="prefix_number">Prefix + Number (e.g. House 1)</option>
                        <option value="prefix_address">Prefix + Address (e.g. House - 95 Main St)</option>
                        <option value="address_only">Address Only</option>
                      </SearchableSelect>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="pref-max-units">Max Units Per Bulk</Label>
                    <Input
                      id="pref-max-units"
                      type="number"
                      min={1}
                      max={100}
                      value={prefMaxUnits}
                      onChange={(e) => setPrefMaxUnits(Math.min(100, Math.max(1, Number(e.target.value))))}
                      className="mt-1 max-w-[120px]"
                    />
                    <p className="text-xs text-muted-fg mt-1">Maximum is 100</p>
                  </div>
                </CardContent>
              </Card>

              {/* Customer Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink-soft">Require Customer on Every Project</p>
                      <p className="text-xs text-muted-fg mt-0.5">Projects must be linked to a customer record</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefRequireCustomer((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${prefRequireCustomer ? 'bg-accent' : 'bg-muted2'}`}
                      role="switch"
                      aria-checked={prefRequireCustomer}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition-transform ${prefRequireCustomer ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink-soft">Show Customer Column in Project List</p>
                      <p className="text-xs text-muted-fg mt-0.5">Display the customer column in project tables</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefShowCustomerCol((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${prefShowCustomerCol ? 'bg-accent' : 'bg-muted2'}`}
                      role="switch"
                      aria-checked={prefShowCustomerCol}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition-transform ${prefShowCustomerCol ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3">
                <Button onClick={savePreferences}>Save Preferences</Button>
                {prefSaved && <span className="text-sm text-success">Saved!</span>}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-accent-fg" /> Delete protection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-fg">
                    When on, deleting important records (quotes, invoices, budget lines, quote requests, and uploaded files)
                    asks for a secret key first - a safeguard against accidental or unauthorized deletions.
                  </p>

                  <label className="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-ink-soft">Require the secret key to delete</span>
                      <span className="block text-xs text-faint mt-0.5">{dpKeySet ? 'A key is set.' : 'No key set yet - enter one below.'}</span>
                    </span>
                    <button type="button" role="switch" aria-checked={dpEnabled} onClick={() => setDpEnabled(v => !v)}
                      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', dpEnabled ? 'bg-accent' : 'bg-muted2')}>
                      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white transition-transform', dpEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </label>

                  <div className="space-y-1.5">
                    <Label>{dpKeySet ? 'Change the secret key' : 'Set a secret key'}</Label>
                    <Input type="password" value={dpKey} onChange={e => setDpKey(e.target.value)} placeholder={dpKeySet ? 'Leave blank to keep the current key' : 'Choose a key…'} />
                    <p className="text-xs text-faint">Share this only with people allowed to delete financial records. It's stored hashed - we can't recover it, only replace it.</p>
                  </div>

                  {dpMsg && <p className={cn('text-sm', dpMsg.ok ? 'text-success' : 'text-danger')}>{dpMsg.text}</p>}
                  <div className="flex justify-end">
                    <Button onClick={saveDeleteProtection} disabled={dpSaving}>{dpSaving ? 'Saving…' : 'Save'}</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-accent-fg" /> Auto sign-out</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-fg">
                    Sign everyone in the company out automatically after a period of inactivity. Good for shared office
                    computers and lost phones. Applies the next time each person loads the app.
                  </p>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Sign out after</Label>
                    <SearchableSelect value={autoLogout} onChange={e => setAutoLogout(e.target.value)} sort={false} searchable={false}>
                      <option value="0">Never (stay signed in)</option>
                      <option value="15">15 minutes of inactivity</option>
                      <option value="30">30 minutes of inactivity</option>
                      <option value="60">1 hour of inactivity</option>
                      <option value="240">4 hours of inactivity</option>
                      <option value="480">8 hours of inactivity</option>
                    </SearchableSelect>
                  </div>
                  {autoLogoutMsg && <p className={cn('text-sm', autoLogoutMsg.ok ? 'text-success' : 'text-danger')}>{autoLogoutMsg.text}</p>}
                  <div className="flex justify-end">
                    <Button disabled={autoLogoutSaving} onClick={async () => {
                      setAutoLogoutSaving(true); setAutoLogoutMsg(null)
                      const headers = await authHeaders()
                      const res = await fetch('/api/settings', {
                        method: 'PATCH', headers,
                        body: JSON.stringify({ company: { auto_logout_minutes: Number(autoLogout) || 0 } }),
                      })
                      setAutoLogoutSaving(false)
                      setAutoLogoutMsg(res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: 'Failed to save.' })
                    }}>{autoLogoutSaving ? 'Saving…' : 'Save'}</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-ink">Integrations</h2>
                <p className="mt-1 text-sm text-muted-fg">Connect SyteNav to the tools you already use.</p>
              </div>
              <QuickBooksCard />
              <LinkedInCard />
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: BILLING */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* Current Plan */}
              <Card>
                <CardHeader>
                  <CardTitle>Current Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold text-ink">Starter Plan</p>
                      <p className="text-sm text-muted-fg mt-0.5">Free during beta</p>
                    </div>
                    <Button disabled className="opacity-60 cursor-not-allowed">
                      Upgrade (Coming Soon)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Usage */}
              <Card>
                <CardHeader>
                  <CardTitle>Usage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Team Members', used: teammates.length, max: 5, unit: '' },
                    { label: 'Projects',     used: 0,                max: 10, unit: '' },
                    { label: 'Storage',      used: 0,                max: 5,  unit: ' GB' },
                  ].map(({ label, used, max, unit }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm text-muted-fg mb-1">
                        <span>{label}</span>
                        <span>{used} / {max}{unit}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${Math.min((used / max) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Plans comparison */}
              <div>
                <h3 className="text-base font-semibold text-ink mb-3">Available Plans</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      name: 'Starter',
                      price: 'Free',
                      current: true,
                      features: ['Up to 5 users', '10 projects', '5 GB storage', 'Core features'],
                    },
                    {
                      name: 'Pro',
                      price: '$49 / mo',
                      current: false,
                      features: ['Up to 25 users', 'Unlimited projects', '50 GB storage', 'Priority support', 'Advanced reports'],
                    },
                    {
                      name: 'Enterprise',
                      price: 'Custom',
                      current: false,
                      features: ['Unlimited users', 'Unlimited projects', 'Custom storage', 'Dedicated support', 'SSO / SAML', 'Custom integrations'],
                    },
                  ].map((plan) => (
                    <div
                      key={plan.name}
                      className={`rounded-xl border p-5 ${plan.current ? 'border-accent bg-accent-tint' : 'border-line bg-panel'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-ink">{plan.name}</p>
                        {plan.current && (
                          <span className="text-xs bg-accent-tint text-accent-fg px-2 py-0.5 rounded-full font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-ink mb-3">{plan.price}</p>
                      <ul className="space-y-1.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-sm text-muted-fg">
                            <Check className="h-3.5 w-3.5 text-success shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {!plan.current && (
                        <Button
                          disabled
                          variant="outline"
                          className="mt-4 w-full opacity-60 cursor-not-allowed"
                        >
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: DANGER ZONE */}
          {activeTab === 'danger' && (
            <Card className="border-danger/30">
              <CardHeader>
                <CardTitle className="text-danger flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-danger/30 rounded-lg p-5 bg-danger-tint">
                  <p className="font-medium text-ink mb-1">Delete Company Account</p>
                  <p className="text-sm text-muted-fg mb-4">
                    This will permanently delete your company account, all projects, and all associated
                    data. This action cannot be undone.
                  </p>

                  {dangerStep === 'idle' && (
                    <Button
                      variant="outline"
                      className="border-red-400 text-danger hover:bg-danger-tint"
                      onClick={() => setDangerStep('confirm')}
                    >
                      Delete Company Account
                    </Button>
                  )}

                  {(dangerStep === 'confirm' || dangerStep === 'deleting') && (
                    <div className="space-y-3 max-w-sm">
                      <p className="text-sm font-medium text-ink-soft">
                        Type <strong>{companyName || 'your company name'}</strong> to confirm:
                      </p>
                      <Input
                        value={dangerInput}
                        onChange={(e) => setDangerInput(e.target.value)}
                        placeholder={companyName || 'Company name'}
                      />
                      <div className="flex gap-3">
                        <button
                          disabled={dangerInput !== companyName || dangerStep === 'deleting'}
                          onClick={async () => {
                            setDangerStep('deleting')
                            setDangerMsg(null)
                            try {
                              const headers = await authHeaders()
                              const res = await fetch('/api/settings', {
                                method: 'DELETE',
                                headers,
                              })
                              if (res.ok) {
                                setDangerStep('done')
                                setDangerMsg({ ok: true, text: 'Account deleted. Signing you out…' })
                                setTimeout(async () => {
                                  const supabase = createClient()
                                  await supabase.auth.signOut()
                                  window.location.href = '/login'
                                }, 3000)
                              } else {
                                setDangerStep('confirm')
                                setDangerMsg({ ok: false, text: 'Failed to delete account. Contact support.' })
                              }
                            } catch {
                              setDangerStep('confirm')
                              setDangerMsg({ ok: false, text: 'Network error.' })
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-danger-solid text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
                        >
                          {dangerStep === 'deleting' ? 'Deleting…' : 'Confirm Delete'}
                        </button>
                        <Button
                          variant="outline"
                          onClick={() => { setDangerStep('idle'); setDangerInput(''); setDangerMsg(null) }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {dangerMsg && (
                        <p className={`text-sm ${dangerMsg.ok ? 'text-success' : 'text-danger'}`}>
                          {dangerMsg.text}
                        </p>
                      )}
                    </div>
                  )}

                  {dangerStep === 'done' && (
                    <p className="text-sm text-success font-medium">
                      Account deleted. Signing you out…
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}
