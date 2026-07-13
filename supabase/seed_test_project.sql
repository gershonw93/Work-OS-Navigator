-- ============================================================================
-- WorkOS Navigator - Test Project Seed
-- ----------------------------------------------------------------------------
-- Creates a fully-populated demo project (subs, workers, tasks, invoices,
-- plans, daily logs, RFIs, permits, inspections) under YOUR company so you can
-- see what a "full" project looks like and then edit/test against it.
--
-- HOW TO RUN:
--   1. In Supabase → SQL Editor, paste this whole file.
--   2. Set v_owner_email below to the email of the admin you log in as.
--   3. Run. It prints the new project id at the end.
--
-- TO REMOVE LATER: delete the project named 'TEST - Maple Street Residences'
--   from the Projects page (cascades remove everything seeded here), or run the
--   cleanup block at the very bottom.
-- ============================================================================

DO $$
DECLARE
  v_owner_email   text := 'gershonweisblum@gmail.com';   -- 👈 CHANGE to your admin login email
  v_company_id    uuid;
  v_owner_id      uuid;
  v_project_id    uuid;

  -- sub company ids
  v_sub_concrete  uuid;
  v_sub_electric  uuid;
  v_sub_plumb     uuid;
  v_sub_framing   uuid;
  v_sub_hvac      uuid;
  v_sub_roofing   uuid;

  -- subcontract ids
  v_sc_concrete   uuid;
  v_sc_electric   uuid;
  v_sc_plumb      uuid;
  v_sc_framing    uuid;
  v_sc_hvac       uuid;
  v_sc_roofing    uuid;

  -- team member ids
  v_tm_super      uuid;
  v_tm_w1         uuid;
  v_tm_w2         uuid;
  v_tm_w3         uuid;
  v_tm_w4         uuid;
BEGIN
  -- ── Resolve the owner profile + company ──────────────────────────────────
  SELECT p.id, p.company_id INTO v_owner_id, v_company_id
  FROM profiles p
  WHERE lower(p.email) = lower(v_owner_email)
  LIMIT 1;

  IF v_company_id IS NULL THEN
    -- Fallback: first admin profile in the system
    SELECT p.id, p.company_id INTO v_owner_id, v_company_id
    FROM profiles p WHERE p.role = 'admin' ORDER BY p.created_at LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Could not find a company for owner email % (and no admin fallback). Set v_owner_email.', v_owner_email;
  END IF;

  -- ── The project ──────────────────────────────────────────────────────────
  INSERT INTO projects (gc_company_id, name, address, client, start_date, end_date, type, status)
  VALUES (v_company_id, 'TEST - Maple Street Residences', '420 Maple Street, Brooklyn, NY',
          'Maple Holdings LLC', CURRENT_DATE - 60, CURRENT_DATE + 120, 'residential', 'active')
  RETURNING id INTO v_project_id;

  -- ── Subcontractor companies ───────────────────────────────────────────────
  INSERT INTO companies (name, type, trade, contact_email, phone, address, insurance_status, license_number)
  VALUES ('Apex Concrete & Foundations', 'subcontractor', 'Concrete', 'office@apexconcrete.test', '(718) 555-0101', '12 Industrial Ave, Brooklyn, NY', 'active', 'LIC-CON-4471')
  RETURNING id INTO v_sub_concrete;

  INSERT INTO companies (name, type, trade, contact_email, phone, address, insurance_status, license_number)
  VALUES ('Voltline Electric', 'subcontractor', 'Electrical', 'dispatch@voltline.test', '(718) 555-0102', '88 Spark Rd, Queens, NY', 'active', 'LIC-ELE-2299')
  RETURNING id INTO v_sub_electric;

  INSERT INTO companies (name, type, trade, contact_email, phone, address, insurance_status, license_number)
  VALUES ('ClearFlow Plumbing', 'subcontractor', 'Plumbing', 'jobs@clearflow.test', '(718) 555-0103', '5 Pipe St, Bronx, NY', 'expired', 'LIC-PLM-7733')
  RETURNING id INTO v_sub_plumb;

  INSERT INTO companies (name, type, trade, contact_email, phone, address, insurance_status, license_number)
  VALUES ('Ironwood Framing', 'subcontractor', 'Framing', 'build@ironwood.test', '(718) 555-0104', '301 Timber Ln, Brooklyn, NY', 'active', 'LIC-FRM-1188')
  RETURNING id INTO v_sub_framing;

  INSERT INTO companies (name, type, trade, contact_email, phone, address, insurance_status, license_number)
  VALUES ('Northwind HVAC', 'subcontractor', 'HVAC', 'service@northwindhvac.test', '(718) 555-0105', '14 Cooling Ct, Queens, NY', 'active', 'LIC-MEC-6620')
  RETURNING id INTO v_sub_hvac;

  INSERT INTO companies (name, type, trade, contact_email, phone, address, insurance_status, license_number)
  VALUES ('Summit Roofing', 'subcontractor', 'Roofing', 'estimating@summitroof.test', '(718) 555-0106', '77 Ridge Rd, Staten Island, NY', 'missing', 'LIC-ROF-9041')
  RETURNING id INTO v_sub_roofing;

  -- ── Subcontracts (drives Financials + Team subs panel) ────────────────────
  INSERT INTO subcontracts (project_id, company_id, scope, trade, contract_amount, status)
  VALUES (v_project_id, v_sub_concrete, 'Foundation, footings & slab on grade', 'Concrete', 185000, 'active') RETURNING id INTO v_sc_concrete;
  INSERT INTO subcontracts (project_id, company_id, scope, trade, contract_amount, status)
  VALUES (v_project_id, v_sub_electric, 'Full electrical rough-in & finish', 'Electrical', 142000, 'active') RETURNING id INTO v_sc_electric;
  INSERT INTO subcontracts (project_id, company_id, scope, trade, contract_amount, status)
  VALUES (v_project_id, v_sub_plumb, 'DWV, water supply & fixtures', 'Plumbing', 98000, 'active') RETURNING id INTO v_sc_plumb;
  INSERT INTO subcontracts (project_id, company_id, scope, trade, contract_amount, status)
  VALUES (v_project_id, v_sub_framing, 'Wood framing, all floors', 'Framing', 210000, 'active') RETURNING id INTO v_sc_framing;
  INSERT INTO subcontracts (project_id, company_id, scope, trade, contract_amount, status)
  VALUES (v_project_id, v_sub_hvac, 'Heating, ventilation & A/C', 'HVAC', 126000, 'active') RETURNING id INTO v_sc_hvac;
  INSERT INTO subcontracts (project_id, company_id, scope, trade, contract_amount, status)
  VALUES (v_project_id, v_sub_roofing, 'Roof deck, membrane & flashing', 'Roofing', 74000, 'active') RETURNING id INTO v_sc_roofing;

  -- ── Project team members (your crew on this job) ──────────────────────────
  INSERT INTO project_team_members (project_id, name, role, phone, email)
  VALUES (v_project_id, 'Mike Torres', 'Superintendent', '(917) 555-0201', 'mike.torres@example.test') RETURNING id INTO v_tm_super;
  INSERT INTO project_team_members (project_id, name, role, phone, email)
  VALUES (v_project_id, 'Danny Cole', 'Foreman', '(917) 555-0202', 'danny.cole@example.test') RETURNING id INTO v_tm_w1;
  INSERT INTO project_team_members (project_id, name, role, phone, email)
  VALUES (v_project_id, 'Luis Ramirez', 'Laborer', '(917) 555-0203', 'luis.ramirez@example.test') RETURNING id INTO v_tm_w2;
  INSERT INTO project_team_members (project_id, name, role, phone, email)
  VALUES (v_project_id, 'Sam Patel', 'Laborer', '(917) 555-0204', 'sam.patel@example.test') RETURNING id INTO v_tm_w3;
  INSERT INTO project_team_members (project_id, name, role, phone, email)
  VALUES (v_project_id, 'Chris Nguyen', 'Safety Officer', '(917) 555-0205', 'chris.nguyen@example.test') RETURNING id INTO v_tm_w4;

  -- ── Tasks (drives progress bar; mix of statuses) ──────────────────────────
  INSERT INTO project_tasks (project_id, title, description, due_date, priority, status, assigned_to_member_id, assigned_to_name, created_by) VALUES
   (v_project_id, 'Excavate & pour footings', 'Per structural S-101', CURRENT_DATE - 45, 'high',   'completed',   v_tm_w1, 'Danny Cole', 'Seed'),
   (v_project_id, 'Foundation walls',          'Strip & backfill',     CURRENT_DATE - 30, 'high',   'completed',   v_tm_w1, 'Danny Cole', 'Seed'),
   (v_project_id, 'Slab on grade',             '4" with WWM',          CURRENT_DATE - 20, 'medium', 'completed',   v_tm_w2, 'Luis Ramirez', 'Seed'),
   (v_project_id, 'First floor framing',       'Walls + joists',       CURRENT_DATE - 5,  'high',   'in_progress', v_tm_super, 'Mike Torres', 'Seed'),
   (v_project_id, 'Electrical rough-in',       'After framing inspection', CURRENT_DATE + 7, 'medium', 'open',     v_tm_w3, 'Sam Patel', 'Seed'),
   (v_project_id, 'Plumbing rough-in',         'Coordinate w/ electrical', CURRENT_DATE + 10, 'medium', 'open',    v_tm_w3, 'Sam Patel', 'Seed'),
   (v_project_id, 'HVAC ductwork',             'Second floor first',   CURRENT_DATE + 18, 'low',    'open',        v_tm_w2, 'Luis Ramirez', 'Seed'),
   (v_project_id, 'Roof membrane',             'Weather permitting',   CURRENT_DATE + 25, 'medium', 'open',        v_tm_super, 'Mike Torres', 'Seed'),
   (v_project_id, 'Site safety audit',         'Weekly walk',          CURRENT_DATE + 2,  'high',   'in_progress', v_tm_w4, 'Chris Nguyen', 'Seed'),
   (v_project_id, 'Punch list - exterior',     'Before close-in',      CURRENT_DATE + 60, 'low',    'open',        v_tm_w1, 'Danny Cole', 'Seed');

  -- ── Invoices (drives Paid / Outstanding on the card) ──────────────────────
  -- Uses only base invoices columns. 'approved' = owed but unpaid (outstanding).
  INSERT INTO invoices (project_id, subcontract_id, amount, status, submitted_at, approved_at, paid_at) VALUES
   (v_project_id, v_sc_concrete, 92500,  'paid',     NOW() - INTERVAL '42 days', NOW() - INTERVAL '40 days', NOW() - INTERVAL '35 days'),
   (v_project_id, v_sc_concrete, 92500,  'approved', NOW() - INTERVAL '12 days', NOW() - INTERVAL '10 days', NULL),
   (v_project_id, v_sc_framing,  105000, 'paid',     NOW() - INTERVAL '8 days',  NOW() - INTERVAL '6 days',  NOW() - INTERVAL '3 days'),
   (v_project_id, v_sc_framing,  42000,  'approved', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '1 day',   NULL),
   (v_project_id, v_sc_electric, 35000,  'submitted',NOW(), NULL, NULL);

  -- ── Plans ──────────────────────────────────────────────────────────────────
  INSERT INTO project_plans (project_id, name, plan_type, file_url) VALUES
   (v_project_id, 'A-101 Floor Plans',     'architectural', 'https://example.com/plans/a101.pdf'),
   (v_project_id, 'S-101 Foundation Plan', 'structural',    'https://example.com/plans/s101.pdf'),
   (v_project_id, 'M-201 HVAC Layout',     'mep',           'https://example.com/plans/m201.pdf'),
   (v_project_id, 'C-001 Site/Civil',      'civil',         'https://example.com/plans/c001.pdf');

  -- ── Daily logs ──────────────────────────────────────────────────────────────
  INSERT INTO daily_logs (project_id, log_date, workers_onsite, notes, weather, created_by) VALUES
   (v_project_id, CURRENT_DATE - 3, 8,  'Framing crew started first floor walls. Material delivery on time.', 'Sunny, 72F', v_owner_id),
   (v_project_id, CURRENT_DATE - 2, 9,  'Continued framing. Electrician walked site for rough-in prep.',     'Cloudy, 68F', v_owner_id),
   (v_project_id, CURRENT_DATE - 1, 7,  'Half day - rain in afternoon. Tarped open areas.',                  'Rain, 60F',  v_owner_id),
   (v_project_id, CURRENT_DATE,     10, 'Full crew. Safety audit in progress. Framing ~60% first floor.',    'Clear, 70F', v_owner_id);

  -- ── RFIs ────────────────────────────────────────────────────────────────────
  INSERT INTO rfis (project_id, rfi_number, subject, description, response, status, submitted_by_name) VALUES
   (v_project_id, 1, 'Beam size at grid B/3', 'Drawings conflict between S-101 and S-201.', 'Use W12x26 per S-201. S-101 is superseded.', 'answered', 'Mike Torres'),
   (v_project_id, 2, 'Electrical panel location', 'Is the panel flexible by 18 inches to clear plumbing?', NULL, 'open', 'Danny Cole'),
   (v_project_id, 3, 'Window manufacturer substitute', 'Requesting approved substitute for spec''d manufacturer.', NULL, 'open', 'Mike Torres');

  -- ── Permits ─────────────────────────────────────────────────────────────────
  INSERT INTO permits (project_id, permit_type, permit_number, status, expiry_date) VALUES
   (v_project_id, 'Building Permit',    'BP-2026-00841', 'approved', CURRENT_DATE + 300),
   (v_project_id, 'Electrical Permit',  'EP-2026-00219', 'pending',  NULL),
   (v_project_id, 'Plumbing Permit',    NULL,            'pending',  NULL);

  -- ── Inspections ─────────────────────────────────────────────────────────────
  INSERT INTO inspections (project_id, type, status, scheduled_date, notes) VALUES
   (v_project_id, 'Footing Inspection',  'passed',    CURRENT_DATE - 44, 'Passed, no comments.'),
   (v_project_id, 'Foundation Inspection','passed',   CURRENT_DATE - 28, 'Passed with minor note on rebar spacing.'),
   (v_project_id, 'Framing Inspection',  'scheduled', CURRENT_DATE + 6,  'Scheduled with DOB inspector.');

  -- ── Compliance docs (per sub COI/license) ─────────────────────────────────
  INSERT INTO compliance_documents (company_id, project_id, type, status, expiry_date) VALUES
   (v_sub_concrete, v_project_id, 'coi',          'approved', CURRENT_DATE + 200),
   (v_sub_plumb,    v_project_id, 'coi',          'expired',  CURRENT_DATE - 5),
   (v_sub_roofing,  v_project_id, 'coi',          'pending',  NULL),
   (v_sub_electric, v_project_id, 'workers_comp', 'approved', CURRENT_DATE + 150);

  RAISE NOTICE 'Seeded project % under company %', v_project_id, v_company_id;
END $$;

-- ============================================================================
-- CLEANUP (run separately to wipe the seeded demo)
-- ----------------------------------------------------------------------------
-- DELETE FROM companies WHERE contact_email LIKE '%@%.test';
-- DELETE FROM projects WHERE name = 'TEST - Maple Street Residences';
-- ============================================================================
