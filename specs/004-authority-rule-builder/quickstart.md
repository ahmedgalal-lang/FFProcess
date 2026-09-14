# Quickstart: Authority Rule Builder

How to prove the feature works end to end. Prerequisites: a seeded local database and the
dev server, as in the repo README.

```bash
service postgresql start
SEED_DEMO_WORKSPACE=1 pnpm db:seed
pnpm dev
```

## 1. The migration converts real data without losing any

The highest-value check, because this is client work already delivered.

```bash
# Before: capture what the old shape holds
psql -d ffprocess -c "SELECT \"stepId\", \"slaDays\", threshold, direction, \
  \"approverRoleId\", \"coApprovalAboveThreshold\", \"coApproverRoleId\", \"escalationRoleId\" \
  FROM authority_assignments ORDER BY \"createdAt\""

pnpm prisma migrate deploy

# After: every value above must appear somewhere here
psql -d ffprocess -c "SELECT a.\"stepId\", r.\"order\", r.measure, r.amount, r.days, \
  r.direction, r.consequence, r.\"whoRoleId\" FROM authority_rules r \
  JOIN authority_assignments a ON a.id = r.\"assignmentId\" ORDER BY a.\"stepId\", r.\"order\""
```

Expected for the seeded PUR101, which exercises four of the five conversion cases:

| Task | Rules after conversion |
| --- | --- |
| Create Purchase Order | MONEY $10,000 GREATER_THAN → APPROVAL (AP Clerk); TIME 2d → ESCALATION (Procurement Lead) |
| Approve Purchase Order | MONEY $100,000 GREATER_OR_EQUAL → APPROVAL (Finance Manager); MONEY $50,000 → APPROVAL (co-approver, unassigned); TIME 3d → ESCALATION (unassigned) |
| Revise Purchase Order | one NONE rule (EQUAL_NO_APPROVAL) |
| Match Invoice to PO | MONEY $20,000 → APPROVAL (Finance Manager); TIME 2d → ESCALATION (unassigned) |
| Approve Payment | MONEY $100,000 → APPROVAL (unassigned); MONEY $50,000 → APPROVAL (unassigned); TIME 5d → ESCALATION (Finance Manager) |

Re-run `pnpm prisma migrate deploy` — it must be a clean no-op (FR-019).

## 2. Build a rule in three moves (User Story 1)

Open `/workspaces/workspace-acme/processes/<PUR101>/authority`.

1. On a task with no rules, press **add** → an empty rule appears.
2. Press **Money** → a currency field appears and no days field.
3. Type `25,000`, choose **More than**, choose **Needs approval**, pick **Controller**.
4. The sentence under the rule reads
   *"More than $25,000 needs approval from Controller."*
5. Press **Time** → the currency field is replaced by a days field and the figure does not
   carry over (FR-003).
6. Reload → everything is still there.

## 3. Several rules on one task (User Story 2)

1. On the same task press **add another approval** → a second rule appears.
2. Set it to Money / $100,000 / More than / Needs approval / Finance Manager.
3. Edit the first rule's amount → the second is untouched.
4. Delete the first → the second remains and the task is still listed.

## 4. The rules reach every document (User Story 4)

```bash
# Report preview
open /reports/workspace-acme?ids=<PUR101>
# PPTX
curl -o /tmp/r.pptx "http://localhost:3000/api/export/report/workspace-acme?ids=<PUR101>"
unzip -p /tmp/r.pptx ppt/slides/slide*.xml | grep -c "needs approval"
# Authority spreadsheet + PDF
open /api/export/authority/<PUR101>?format=xlsx
```

Each must show **both** rules for a two-rule task, in the same order as the screen.

Also open the Process Map: the "Approve Purchase Order" decision must still show
`At or above $100,000` in its diamond.

## 5. Access (FR-027)

Sign in as the Viewer fixture the e2e suite creates. On the Authority Matrix:

- every rule and every figure is visible;
- no add, delete, measure or consequence control is offered;
- the rule count matches what an Editor sees.

## 6. The automated gates

```bash
pnpm lint && pnpm test && pnpm build && npx playwright test
```

All four must pass. `tests/e2e/accessibility.spec.ts` covers the Authority matrix with axe —
the two new toggle groups must not add a violation (Principle IV).
