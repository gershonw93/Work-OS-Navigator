-- 137: a job whose client was TYPED ("+ New client…") gets a real customer.
--
-- The project form stored the typed name in projects.client and never created
-- a customers row, so the header named a client that the Customers list and
-- Project Settings (customer_id) had never heard of. The route now creates the
-- customer (lib/project-customer.ts); this links the jobs made before it did.
--
-- Matching is the Customers page's own rule: same company, same name ignoring
-- case and surrounding space. An existing card is reused; otherwise one is
-- created, once per company and name (two jobs for "JS" share one card).
-- Idempotent: a second run finds nothing left with a name and no link.

insert into customers (gc_company_id, name)
select distinct on (p.gc_company_id, lower(trim(p.client)))
       p.gc_company_id, trim(p.client)
from projects p
where p.customer_id is null
  and p.gc_company_id is not null
  and coalesce(trim(p.client), '') <> ''
  and not exists (
    select 1 from customers c
    where c.gc_company_id = p.gc_company_id
      and lower(trim(c.name)) = lower(trim(p.client))
  )
order by p.gc_company_id, lower(trim(p.client)), p.created_at;

update projects p
set customer_id = c.id,
    client = c.name
from customers c
where p.customer_id is null
  and p.gc_company_id is not null
  and coalesce(trim(p.client), '') <> ''
  and c.gc_company_id = p.gc_company_id
  and lower(trim(c.name)) = lower(trim(p.client))
  and c.id = (
    select c2.id from customers c2
    where c2.gc_company_id = p.gc_company_id
      and lower(trim(c2.name)) = lower(trim(p.client))
    order by c2.created_at
    limit 1
  );
