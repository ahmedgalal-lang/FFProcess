-- DropForeignKey
ALTER TABLE "conflicts_of_interest" DROP CONSTRAINT "conflicts_of_interest_personId_fkey";

-- DropForeignKey
ALTER TABLE "conflicts_of_interest" DROP CONSTRAINT "conflicts_of_interest_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "dpias" DROP CONSTRAINT "dpias_activityId_fkey";

-- DropForeignKey
ALTER TABLE "dpias" DROP CONSTRAINT "dpias_approvedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ethics_case_notes" DROP CONSTRAINT "ethics_case_notes_authorUserId_fkey";

-- DropForeignKey
ALTER TABLE "ethics_case_notes" DROP CONSTRAINT "ethics_case_notes_caseId_fkey";

-- DropForeignKey
ALTER TABLE "ethics_cases" DROP CONSTRAINT "ethics_cases_investigatorPersonId_fkey";

-- DropForeignKey
ALTER TABLE "ethics_cases" DROP CONSTRAINT "ethics_cases_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incident_actions" DROP CONSTRAINT "governance_incident_actions_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incident_actions" DROP CONSTRAINT "governance_incident_actions_ownerPersonId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incident_actions" DROP CONSTRAINT "governance_incident_actions_ownerRoleId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incident_risks" DROP CONSTRAINT "governance_incident_risks_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incident_risks" DROP CONSTRAINT "governance_incident_risks_riskId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incidents" DROP CONSTRAINT "governance_incidents_processId_fkey";

-- DropForeignKey
ALTER TABLE "governance_incidents" DROP CONSTRAINT "governance_incidents_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_ownerPersonId_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_ownerRoleId_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_processId_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "processing_breach_links" DROP CONSTRAINT "processing_breach_links_activityId_fkey";

-- DropForeignKey
ALTER TABLE "processing_breach_links" DROP CONSTRAINT "processing_breach_links_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "training_completions" DROP CONSTRAINT "training_completions_courseId_fkey";

-- DropForeignKey
ALTER TABLE "training_completions" DROP CONSTRAINT "training_completions_personId_fkey";

-- DropForeignKey
ALTER TABLE "training_courses" DROP CONSTRAINT "training_courses_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_risks" DROP CONSTRAINT "vendor_risks_riskId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_risks" DROP CONSTRAINT "vendor_risks_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_ownerPersonId_fkey";

-- DropForeignKey
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_ownerRoleId_fkey";

-- DropForeignKey
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_workspaceId_fkey";

-- AlterTable
ALTER TABLE "workspaces" DROP COLUMN "nextEthicsCaseNumber";

-- DropTable
DROP TABLE "conflicts_of_interest";

-- DropTable
DROP TABLE "dpias";

-- DropTable
DROP TABLE "ethics_case_notes";

-- DropTable
DROP TABLE "ethics_cases";

-- DropTable
DROP TABLE "governance_incident_actions";

-- DropTable
DROP TABLE "governance_incident_risks";

-- DropTable
DROP TABLE "governance_incidents";

-- DropTable
DROP TABLE "processing_activities";

-- DropTable
DROP TABLE "processing_breach_links";

-- DropTable
DROP TABLE "training_completions";

-- DropTable
DROP TABLE "training_courses";

-- DropTable
DROP TABLE "vendor_risks";

-- DropTable
DROP TABLE "vendors";

-- DropEnum
DROP TYPE "ConflictStatus";

-- DropEnum
DROP TYPE "DpiaResidualRisk";

-- DropEnum
DROP TYPE "DpiaStatus";

-- DropEnum
DROP TYPE "DueDiligenceStatus";

-- DropEnum
DROP TYPE "EthicsCategory";

-- DropEnum
DROP TYPE "EthicsChannel";

-- DropEnum
DROP TYPE "EthicsOutcome";

-- DropEnum
DROP TYPE "EthicsSeverity";

-- DropEnum
DROP TYPE "EthicsStatus";

-- DropEnum
DROP TYPE "IncidentCategory";

-- DropEnum
DROP TYPE "IncidentSeverity";

-- DropEnum
DROP TYPE "IncidentStatus";

-- DropEnum
DROP TYPE "LawfulBasis";

-- DropEnum
DROP TYPE "VendorCriticality";

