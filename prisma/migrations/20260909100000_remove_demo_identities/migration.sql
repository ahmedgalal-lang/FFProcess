-- Removes every fictional identity the seed used to create.
--
-- The seed invented a staff list for its demo workspace: one of them,
-- sam.osei@acme-example.com, had a real sign-in on the published seed
-- password, and the rest were Org Directory entries plus a pending workspace
-- invitation. None of them are real people, and a real client's directory
-- should not contain invented staff.
--
-- Deliberately self-contained rather than relying on the earlier
-- 20260909070000 migration having run: it covers the same account again, and
-- deleting a row that is already gone is a no-op. That matters because a
-- deployment can be behind by an unknown number of migrations, and this is the
-- one that has to be right.
--
-- Emails are listed explicitly rather than matched on the acme-example.com
-- domain, so this can only ever remove the rows the seed itself created.
--
-- Deleting a user cascades to its members, firm_members, accounts and sessions
-- rows — which is also what revokes any session still signed in as one.
-- Deleting a person cascades to person_roles and nulls the manager and
-- approver references held to it. Roles are left alone: the seeded RACI,
-- Authority and Process Map data all reference a role, never its holder.

DELETE FROM users WHERE email IN (
  'sam.osei@acme-example.com',
  'priya.nair@acme-example.com',
  'marcus.webb@acme-example.com',
  'dana.whitfield@acme-example.com'
);

DELETE FROM people WHERE email IN (
  'sam.osei@acme-example.com',
  'priya.nair@acme-example.com',
  'marcus.webb@acme-example.com',
  'dana.whitfield@acme-example.com'
);

-- Invitations that were never accepted have no user row to cascade from.
DELETE FROM members WHERE "invitedEmail" IN (
  'sam.osei@acme-example.com',
  'priya.nair@acme-example.com',
  'marcus.webb@acme-example.com',
  'dana.whitfield@acme-example.com'
);
