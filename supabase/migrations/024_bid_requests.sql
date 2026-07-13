-- Request-for-quote (bid-out) flow. A GC creates a bid request with plans,
-- invites subs (each gets a unique public link/token), and subs submit a quote
-- from a public page - no account required. Feeds Compare Quotes.

CREATE TABLE IF NOT EXISTS bid_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trade TEXT,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_requests_project ON bid_requests (project_id);

CREATE TABLE IF NOT EXISTS bid_request_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_request_id UUID NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_request_attachments_req ON bid_request_attachments (bid_request_id);

CREATE TABLE IF NOT EXISTS bid_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_request_id UUID NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  vendor_company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  vendor_name TEXT,
  vendor_email TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'viewed', 'submitted', 'declined')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bid_invites_req ON bid_invites (bid_request_id);
CREATE INDEX IF NOT EXISTS idx_bid_invites_token ON bid_invites (token);

CREATE TABLE IF NOT EXISTS bid_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_request_id UUID NOT NULL REFERENCES bid_requests (id) ON DELETE CASCADE,
  bid_invite_id UUID REFERENCES bid_invites (id) ON DELETE SET NULL,
  amount NUMERIC(14, 2),
  notes TEXT,
  file_url TEXT,
  file_name TEXT,
  submitted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_req ON bid_submissions (bid_request_id);
