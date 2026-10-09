-- What a builder knows about the lot a house sits on: parcel, block and lot,
-- size, whether city water and sewer reach it, which side the garage goes on,
-- and anything environmental. Arrived as a 42-row lot list with nowhere to put
-- any of it. Optional, and on every project - a custom home has a parcel too.
--
-- city_water / city_sewer are NULLABLE booleans on purpose: false means a well
-- or a septic system (inspections a city-connected house never needs), and
-- NULL means nobody said. A dash in the list is not "no sewer".
--
-- lot_size is NUMERIC with its unit beside it, because the list gave square
-- feet on one page and acres on the next, and converting 0.27 acres into
-- 11,761.2 square feet invents precision the survey never had.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS parcel_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS block text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lot text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lot_size numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lot_size_unit text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city_water boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city_sewer boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS garage_side text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS environmental_notes text;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_lot_size_unit_check
    CHECK (lot_size_unit IS NULL OR lot_size_unit IN ('sqft', 'acres'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_garage_side_check
    CHECK (garage_side IS NULL OR garage_side IN ('left', 'right'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
