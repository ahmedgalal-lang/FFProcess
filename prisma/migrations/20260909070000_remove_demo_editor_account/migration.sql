-- Removes the seeded demo account "Sam Osei" (sam.osei@acme-example.com).
--
-- It was not a real person. It shipped in prisma/seed.ts as a second sign-in
-- with the same well-known password the login page used to display, so any
-- database that has ever been seeded carries a working Editor login for
-- someone who does not exist. Deleting it from the seed does not remove it
-- from a database that already ran the old seed, which is why this is a
-- migration: `prisma migrate deploy` runs on every start, so the account goes
-- wherever the app is already deployed.
--
-- Deleting the user cascades to its members, firm_members, accounts and
-- sessions rows. The Org Directory person of the same name is a separate,
-- unrelated row and is removed too; that cascades to person_roles, and nulls
-- the manager/approver references anything else held to it.
--
-- Idempotent, and a no-op on a database that never had the account.

DELETE FROM users WHERE email = 'sam.osei@acme-example.com';
DELETE FROM people WHERE email = 'sam.osei@acme-example.com';
