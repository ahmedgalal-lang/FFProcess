/**
 * The built-in governance policy templates (spec 029): a standard starting
 * point for an aspect's governing policy. Each is a real, sectioned document
 * a consultant adapts to the client; none is legal advice for a particular
 * jurisdiction. Templates are read-only: using one copies it into a new
 * Draft in the Policy Library, with the client's name filled in.
 */

import { POLICY_TEMPLATES_AR } from "./policy-templates.ar";

export type PolicyTemplate = {
  id: string;
  title: string;
  /** One line for the picker: what the policy is for. */
  purpose: string;
  /** Default aspect names (spec 017) this template governs outright. */
  aspectNames: readonly string[];
  /** Lower-case fragments that suggest this template for a custom aspect's name. */
  keywords: readonly string[];
  body: string;
};

export type TemplateSections = {
  purpose: string;
  scope: string;
  definitions: [string, string][];
  statements: string[];
  roles: [string, string][];
  monitoring: string[];
  approver: string;
};

/** Every template shares one structure, so a client's policy set reads as a set. */
function document(title: string, s: TemplateSections): string {
  const lines = [
    title,
    "{{company}}",
    "",
    "1. Purpose",
    s.purpose,
    "",
    "2. Scope",
    s.scope,
    "",
    "3. Definitions",
    ...s.definitions.map(([term, meaning]) => `- ${term}: ${meaning}`),
    "",
    "4. Policy statements",
    ...s.statements.map((text, i) => `4.${i + 1} ${text}`),
    "",
    "5. Roles and responsibilities",
    ...s.roles.map(([who, duty]) => `- ${who}: ${duty}`),
    "",
    "6. Monitoring and review",
    ...s.monitoring.map((text, i) => `6.${i + 1} ${text}`),
    "",
    "7. Approval and version control",
    `This policy is approved by ${s.approver} and takes effect on its effective date. The policy owner is [policy owner role]. It is reviewed at least every 12 months, and sooner after a significant change in law, regulation or the business. Material changes require the same approval.`,
  ];
  return lines.join("\n");
}

function template(
  id: string,
  title: string,
  purpose: string,
  match: { aspectNames?: string[]; keywords: string[] },
  sections: TemplateSections
): PolicyTemplate {
  return { id, title, purpose, aspectNames: match.aspectNames ?? [], keywords: match.keywords, body: document(title, sections) };
}

export const POLICY_TEMPLATES: readonly PolicyTemplate[] = [
  template(
    "board-charter",
    "Board Charter",
    "How the board is composed, what it decides, and how it holds management to account.",
    { aspectNames: ["Board Structure"], keywords: ["board", "director", "oversight", "committee"] },
    {
      purpose:
        "This charter sets out the role, composition and responsibilities of the Board of Directors of {{company}}, the matters reserved for the Board, and how the Board delegates to management and its committees.",
      scope: "It applies to every member of the Board and to each Board committee, and to senior management in their dealings with the Board.",
      definitions: [
        ["Board", "the Board of Directors of {{company}}."],
        ["Independent director", "a director free of any business, family or other relationship that could materially interfere with independent judgement."],
        ["Reserved matters", "decisions only the Board may take, listed in section 4."],
      ],
      statements: [
        "The Board is collectively responsible for the long-term success of {{company}}: setting strategy, risk appetite and values, and overseeing management's delivery of them.",
        "The Board has at least [number] directors, of whom at least [one third / a majority] are independent. The roles of Chair and Chief Executive are held by different people.",
        "Matters reserved for the Board include: strategy and annual budget; major capital expenditure, acquisitions and disposals above [threshold]; appointment and removal of the Chief Executive; approval of the annual accounts; the risk appetite statement; and approval of this charter and other governing policies.",
        "The Board meets at least [number] times a year. A quorum is [number] directors, including at least one independent director. Minutes record decisions and dissent.",
        "The Board may delegate to committees (such as Audit and Risk, Remuneration, and Nomination) under written terms of reference, while remaining accountable for their decisions.",
        "Directors declare any conflict of interest before the relevant item and do not vote on it.",
        "The Board evaluates its own performance, and that of its committees and individual directors, at least annually.",
      ],
      roles: [
        ["Chair", "leads the Board, sets agendas, ensures directors receive accurate and timely information, and promotes open debate."],
        ["Chief Executive", "runs the business within the authority delegated by the Board and reports on performance and risk."],
        ["Company Secretary", "supports the Board's procedures, records decisions and maintains the register of interests."],
        ["Independent directors", "provide constructive challenge and oversight free from executive bias."],
      ],
      monitoring: [
        "The Company Secretary reports attendance, overdue actions and conflicts declared to the Board annually.",
        "The annual Board evaluation reviews whether the Board operated in line with this charter.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "risk-management",
    "Risk Management Policy",
    "How risks are identified, assessed, owned, treated and reported, within the Board's risk appetite.",
    { aspectNames: ["Risk & Internal Controls"], keywords: ["risk", "control", "internal audit", "compliance"] },
    {
      purpose:
        "This policy sets out how {{company}} identifies, assesses, treats, monitors and reports the risks that could affect its objectives, and how its system of internal control supports that.",
      scope: "It applies to all activities, business units, projects and processes of {{company}}, and to all employees and contractors.",
      definitions: [
        ["Risk", "the effect of uncertainty on objectives, expressed as a combination of likelihood and impact."],
        ["Risk appetite", "the amount and type of risk the Board is willing to accept in pursuit of its objectives."],
        ["Risk owner", "the person with the authority and accountability to manage a given risk."],
        ["Control", "a process, policy or action that reduces the likelihood or impact of a risk."],
      ],
      statements: [
        "Risks are identified at least quarterly and whenever a significant change, project or incident occurs, and recorded in the risk register.",
        "Each risk is scored for likelihood and impact on the scales in the risk register, and has a named risk owner.",
        "Every risk above the Board's risk appetite has a treatment plan: mitigate, transfer, accept or avoid, with actions, owners and due dates. Accepting such a risk requires [the Board / the Audit and Risk Committee]'s approval and a recorded rationale.",
        "Key controls are documented, assigned to control owners, and tested at a frequency proportionate to the risk.",
        "Incidents and near misses are reviewed to update risk scores and controls.",
        "Principal risks and their trend are reported to the Board at least [quarterly].",
      ],
      roles: [
        ["Board", "sets the risk appetite and oversees the effectiveness of risk management and internal control."],
        ["Audit and Risk Committee", "reviews the risk register, treatment plans and control testing on the Board's behalf."],
        ["Management", "runs the risk management process and maintains the system of internal control."],
        ["Risk owners", "assess their risks, deliver treatment actions and report changes promptly."],
      ],
      monitoring: [
        "The risk register is reviewed in full at least quarterly, and overdue treatment actions are escalated.",
        "Internal or external assurance over key controls is obtained at least annually.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "code-of-ethics",
    "Code of Ethics and Conduct",
    "The standards of behaviour expected of everyone who works for or on behalf of the organisation.",
    { aspectNames: ["Ethics Policy"], keywords: ["ethic", "conduct", "integrity", "values", "culture"] },
    {
      purpose: "This code sets out the values and standards of behaviour {{company}} expects of everyone who works for it or on its behalf.",
      scope: "It applies to directors, employees, contractors and anyone acting on behalf of {{company}}, in every country where it operates.",
      definitions: [
        ["Stakeholders", "customers, employees, suppliers, shareholders, regulators and the communities affected by {{company}}."],
        ["Misconduct", "any breach of law, of this code or of a {{company}} policy."],
      ],
      statements: [
        "We comply with the law and with {{company}}'s policies wherever we operate. Where local custom conflicts with this code, this code applies.",
        "We treat everyone with dignity and respect. Harassment, bullying and discrimination are not tolerated.",
        "We act honestly: we do not offer or accept bribes, falsify records, or mislead customers, regulators or colleagues.",
        "We avoid conflicts of interest and declare any that arise under the Conflict of Interest Policy.",
        "We protect company assets and confidential information, and personal data under the Data Protection Policy.",
        "We compete fairly and do not share commercially sensitive information with competitors.",
        "We speak up about suspected misconduct through the channels in the Whistleblowing Policy, and we never retaliate against anyone who does so in good faith.",
      ],
      roles: [
        ["Board", "sets the tone from the top and holds management accountable for the organisation's culture."],
        ["Managers", "lead by example, make sure their teams understand this code, and act on concerns raised with them."],
        ["Everyone", "reads, acknowledges and follows this code, and asks when unsure."],
      ],
      monitoring: [
        "Everyone in scope acknowledges this code on joining and each year after.",
        "Breaches, trends in concerns raised and the outcome of investigations are reported to the Board at least annually.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "remuneration",
    "Remuneration Policy",
    "How directors' and executives' pay is set, linked to performance, and disclosed.",
    { aspectNames: ["Compensation"], keywords: ["remuneration", "compensation", "pay", "reward", "incentive", "bonus"] },
    {
      purpose:
        "This policy sets out how {{company}} determines the remuneration of its directors and senior executives, so that pay supports long-term performance and is fair, transparent and proportionate.",
      scope: "It applies to executive and non-executive directors and to [senior executives / the executive committee], and guides pay principles across the workforce.",
      definitions: [
        ["Fixed pay", "salary, benefits and pension."],
        ["Variable pay", "annual bonus and long-term incentives, dependent on performance."],
        ["Malus and clawback", "the reduction or recovery of variable pay in defined circumstances."],
      ],
      statements: [
        "Remuneration is set by the Remuneration Committee, and no director decides their own pay.",
        "Pay is benchmarked against comparable organisations and takes account of pay and conditions across the workforce.",
        "Variable pay is linked to measurable financial and non-financial objectives, including risk and conduct, set at the start of each performance period.",
        "Variable pay is subject to malus and clawback in cases of misconduct, material misstatement or serious risk failure.",
        "Non-executive directors receive fixed fees only and no performance-related pay.",
        "Remuneration outcomes and the reasons for them are disclosed to shareholders [in the annual report].",
      ],
      roles: [
        ["Remuneration Committee", "designs and applies this policy, approves executive pay and reports to the Board."],
        ["Board", "approves this policy and the fees of non-executive directors."],
        ["Human Resources", "provides benchmarking data and administers pay in line with decisions."],
      ],
      monitoring: [
        "The Committee reviews this policy's outcomes against performance each year.",
        "Any use of malus or clawback is recorded and reported to the Board.",
      ],
      approver: "the Board on the recommendation of the Remuneration Committee",
    }
  ),
  template(
    "sustainability",
    "Sustainability (ESG) Policy",
    "The organisation's environmental, social and governance commitments, targets and reporting.",
    { aspectNames: ["ESG"], keywords: ["esg", "sustainab", "environment", "climate", "social"] },
    {
      purpose:
        "This policy sets out {{company}}'s commitments on environmental, social and governance matters and how they are managed, measured and reported.",
      scope: "It applies to all operations of {{company}} and, through procurement, to its significant suppliers.",
      definitions: [
        ["ESG", "environmental, social and governance matters that affect, or are affected by, the business."],
        ["Material topic", "an ESG topic significant to {{company}}'s stakeholders or its long-term value."],
      ],
      statements: [
        "{{company}} carries out a materiality assessment at least every [two] years to identify its material ESG topics.",
        "For each material topic, {{company}} sets objectives and measurable targets, such as [greenhouse gas reduction, health and safety, diversity].",
        "{{company}} complies with applicable environmental law and seeks to reduce its environmental impact, including energy use, emissions and waste.",
        "{{company}} respects human rights and expects the same of its suppliers.",
        "ESG risks are included in the risk register and managed under the Risk Management Policy.",
        "Progress against targets is reported to the Board and disclosed publicly [annually].",
      ],
      roles: [
        ["Board", "oversees ESG strategy, targets and disclosures."],
        ["ESG lead", "coordinates the materiality assessment, data collection and reporting."],
        ["Business units", "deliver actions towards the targets in their area."],
      ],
      monitoring: [
        "ESG data is subject to internal review before publication, and to external assurance where required.",
        "The Board reviews progress against targets at least annually.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "data-governance",
    "Data Governance Policy",
    "Who owns the organisation's data and how its quality, integrity and access are controlled.",
    { aspectNames: ["Data Integrity"], keywords: ["data integrity", "data governance", "data quality", "records", "information management"] },
    {
      purpose:
        "This policy sets out how {{company}} governs its data so that it is accurate, complete, secure and fit for the decisions and reports that rely on it.",
      scope: "It applies to all data created, received or held by {{company}}, in any system or format, and to everyone who handles it.",
      definitions: [
        ["Data owner", "the senior person accountable for a data set's definition, quality and access."],
        ["Data steward", "the person who maintains a data set day to day on the owner's behalf."],
        ["Critical data", "data used in financial reporting, regulatory returns or key decisions."],
      ],
      statements: [
        "Every critical data set has a named data owner and data steward.",
        "Critical data has documented definitions and quality rules, and is checked against them at a defined frequency.",
        "Access to data is granted on a need-to-know basis, approved by the data owner and reviewed at least annually.",
        "Changes to critical data and its systems are controlled, tested and logged.",
        "Data is retained and disposed of in line with the retention schedule.",
        "Data quality issues that affect reporting or decisions are logged, investigated and fixed at the root cause.",
      ],
      roles: [
        ["Board", "oversees data governance as part of risk and internal control."],
        ["Data owners", "approve definitions, quality rules and access for their data."],
        ["Data stewards", "maintain data quality and resolve issues."],
        ["IT", "operates the systems and technical controls that protect data."],
      ],
      monitoring: [
        "Data quality results for critical data are reported to management [monthly].",
        "Access reviews and retention compliance are checked at least annually.",
      ],
      approver: "[the Board / the executive committee]",
    }
  ),
  template(
    "accessibility",
    "Accessibility Policy",
    "How the organisation makes its services, premises and digital channels accessible to disabled people.",
    { aspectNames: ["Accessibility"], keywords: ["accessib", "disabilit", "inclusion", "wcag"] },
    {
      purpose:
        "This policy sets out {{company}}'s commitment to making its services, workplaces and digital channels accessible to everyone, including disabled customers and employees.",
      scope: "It applies to {{company}}'s products, services, websites and apps, documents, premises, and employment practices.",
      definitions: [
        ["Reasonable adjustment", "a change that removes or reduces a disadvantage a disabled person faces."],
        ["WCAG", "the Web Content Accessibility Guidelines published by the W3C."],
      ],
      statements: [
        "New and updated websites and apps meet WCAG [2.2] level AA, and existing ones are brought up to it on a published plan.",
        "Customer documents and communications are available in accessible formats on request.",
        "Premises are assessed for physical accessibility, and barriers are addressed on a prioritised plan.",
        "{{company}} makes reasonable adjustments for employees and candidates throughout recruitment and employment.",
        "Accessibility is considered from the start of every new product, service or procurement.",
        "Anyone can report an accessibility barrier, and reports are acknowledged within [5] working days.",
      ],
      roles: [
        ["Board", "oversees accessibility commitments and progress."],
        ["Accessibility lead", "coordinates audits, the improvement plan and reporting."],
        ["Product and service owners", "build accessibility into what they deliver."],
        ["Human Resources", "manages reasonable adjustments for employees and candidates."],
      ],
      monitoring: [
        "Digital channels are audited against WCAG at least annually, and results are published in an accessibility statement.",
        "Barriers reported and the time taken to resolve them are reported to management.",
      ],
      approver: "[the Board / the executive committee]",
    }
  ),
  template(
    "conflict-of-interest",
    "Conflict of Interest Policy",
    "How personal interests that could influence decisions are declared, recorded and managed.",
    { keywords: ["conflict", "interest", "related part"] },
    {
      purpose:
        "This policy sets out how {{company}} identifies, declares and manages conflicts of interest, so that decisions are made in the organisation's interest and are seen to be.",
      scope: "It applies to directors, employees, contractors and anyone acting on behalf of {{company}}.",
      definitions: [
        ["Conflict of interest", "a situation where a personal, family, financial or other interest could influence, or appear to influence, a person's decisions for {{company}}."],
        ["Related party", "a person or organisation connected to someone in scope, such as a family member or a business they have an interest in."],
      ],
      statements: [
        "Everyone in scope declares any actual, potential or perceived conflict as soon as it arises, and in any case before taking part in a related decision.",
        "Directors and [staff in decision-making roles] complete an annual declaration, including a nil return.",
        "Declared conflicts are recorded in a register of interests, with how each is being managed.",
        "A person with a conflict does not take part in the related decision, unless the approver documents why the conflict is acceptably managed another way.",
        "Transactions with related parties are approved in advance by [the Board / the Audit Committee] on arm's-length terms.",
        "Failing to declare a conflict is a disciplinary matter.",
      ],
      roles: [
        ["Board", "approves this policy and manages directors' conflicts."],
        ["Line managers", "agree how employees' conflicts are managed and record the decision."],
        ["Company Secretary or Compliance", "maintains the register of interests and runs the annual declaration."],
      ],
      monitoring: [
        "Completion of annual declarations is reported to the Board.",
        "The register is reviewed at least annually to confirm each conflict is still managed or can be closed.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "whistleblowing",
    "Whistleblowing Policy",
    "How concerns about wrongdoing can be raised safely, and how they are investigated.",
    { keywords: ["whistleblow", "speak-up", "speak up", "hotline", "ethics case", "reporting concern"] },
    {
      purpose:
        "This policy encourages people to report suspected wrongdoing at {{company}}, explains how to do so safely and confidentially, and sets out how reports are handled and reporters protected.",
      scope: "It applies to employees, former employees, contractors, suppliers and anyone else who becomes aware of wrongdoing connected to {{company}}.",
      definitions: [
        ["Wrongdoing", "suspected breaches of law, regulation or company policy, including fraud, bribery, danger to health and safety or the environment, and cover-ups of any of these."],
        ["Retaliation", "any detrimental treatment of a person because they made a report in good faith."],
      ],
      statements: [
        "Concerns can be raised with a line manager, with [the Compliance function], or through [the confidential hotline / email], including anonymously.",
        "Reports are acknowledged within 7 days and the reporter receives feedback on the action taken within 3 months, where they can be contacted.",
        "Each report is triaged and, where warranted, investigated by someone independent of the matter.",
        "The reporter's identity is kept confidential and disclosed only with consent or where the law requires.",
        "Retaliation is prohibited and is a disciplinary matter. Reporters are protected even if the concern turns out to be mistaken, provided it was raised in good faith.",
        "Reports and investigations are recorded securely and access is limited to those handling them.",
      ],
      roles: [
        ["Board", "oversees the whistleblowing arrangements and receives summary reports."],
        ["Whistleblowing officer", "receives and triages reports, assigns investigators and protects confidentiality."],
        ["Investigators", "establish the facts independently and recommend outcomes."],
      ],
      monitoring: [
        "The number, type, timeliness and outcome of reports are reported to the Board, without identifying reporters.",
        "Staff awareness of the channels is checked periodically.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "anti-bribery",
    "Anti-Bribery and Corruption Policy",
    "Zero tolerance of bribery, and the controls on gifts, hospitality and third parties.",
    { keywords: ["brib", "corruption", "anti-bribery", "gifts", "hospitality", "fraud"] },
    {
      purpose:
        "This policy sets out {{company}}'s zero tolerance of bribery and corruption and the controls that prevent it, including on gifts, hospitality and third parties.",
      scope: "It applies to directors, employees, contractors, agents and anyone acting on behalf of {{company}}, everywhere it operates.",
      definitions: [
        ["Bribe", "anything of value offered, given, requested or accepted to improperly influence a decision."],
        ["Facilitation payment", "a small unofficial payment to speed up a routine government action."],
        ["Public official", "anyone holding a public office or working for a government body or state-owned business."],
      ],
      statements: [
        "No one may offer, give, request or accept a bribe, directly or through a third party.",
        "Facilitation payments are prohibited, except where a person's safety is at immediate risk; any such payment is reported immediately.",
        "Gifts and hospitality must be modest, infrequent and transparent. Anything above [value] is approved in advance and recorded in the gifts and hospitality register. Nothing is given to public officials without [Compliance] approval.",
        "Third parties acting for {{company}} undergo risk-based due diligence and agree to anti-bribery terms.",
        "Political donations are not made on {{company}}'s behalf. Charitable donations are approved and recorded.",
        "Books and records accurately reflect every transaction.",
      ],
      roles: [
        ["Board", "sets zero tolerance and oversees the programme."],
        ["Compliance", "maintains this policy, the registers and training, and advises on grey areas."],
        ["Managers", "ensure their teams and third parties follow this policy."],
      ],
      monitoring: [
        "The gifts and hospitality register and third-party due diligence are reviewed at least annually.",
        "The bribery risk assessment is refreshed at least every [two] years and on entering new markets.",
      ],
      approver: "the Board",
    }
  ),
  template(
    "third-party",
    "Third-Party Management Policy",
    "How suppliers and partners are selected, checked, contracted and monitored in proportion to their risk.",
    { keywords: ["third-party", "third party", "vendor", "supplier", "outsourc", "procurement", "partner"] },
    {
      purpose:
        "This policy sets out how {{company}} manages the risks of relying on suppliers, vendors and other third parties, in proportion to how critical each one is.",
      scope: "It applies to every third party that provides goods or services to {{company}} or acts on its behalf, and to the staff who engage them.",
      definitions: [
        ["Third party", "any external organisation or individual {{company}} does business with, other than customers."],
        ["Critical third party", "one whose failure would materially disrupt {{company}}'s operations, customers or compliance."],
        ["Due diligence", "checks on a third party's financial standing, capability, security, compliance and integrity."],
      ],
      statements: [
        "Every third party is assigned a criticality rating when engaged, and has a named internal relationship owner.",
        "Due diligence is completed before contracting, with depth proportionate to criticality, and repeated at least [annually] for critical third parties.",
        "Contracts include service levels, confidentiality and data protection terms, audit rights, and exit arrangements.",
        "Critical third parties have a documented exit or contingency plan.",
        "Contract renewals are reviewed at least [60] days before expiry.",
        "Third-party risks are recorded in the risk register.",
      ],
      roles: [
        ["Relationship owners", "manage performance and risk for their third parties."],
        ["Procurement", "runs selection, due diligence and contracting."],
        ["Management", "approves engagement of critical third parties."],
      ],
      monitoring: [
        "An inventory of third parties with criticality, due diligence status and contract dates is maintained and reviewed [quarterly].",
        "Performance of critical third parties is reviewed against service levels at least [quarterly].",
      ],
      approver: "[the Board / the executive committee]",
    }
  ),
  template(
    "incident-management",
    "Incident Management Policy",
    "How incidents are reported, classified, investigated, and learned from.",
    { keywords: ["incident", "issue", "breach", "crisis", "business continuity", "event"] },
    {
      purpose:
        "This policy sets out how {{company}} reports, responds to, investigates and learns from incidents, so that harm is limited and the same failure does not recur.",
      scope: "It applies to all operational, financial, IT and security, health and safety, and compliance incidents, and to everyone at {{company}}.",
      definitions: [
        ["Incident", "an event that caused, or nearly caused, harm, loss, disruption or a breach of law or policy."],
        ["Root cause", "the underlying reason an incident happened, which if removed prevents recurrence."],
        ["Corrective action", "a change made to address a root cause."],
      ],
      statements: [
        "Anyone who becomes aware of an incident reports it immediately through [the incident reporting channel].",
        "Each incident is logged and classified by severity using the incident severity scale, and escalated according to it.",
        "Incidents involving personal data are assessed at once under the Data Protection Policy, including any duty to notify a regulator within its deadline.",
        "Significant incidents are investigated to find the root cause, and corrective actions are assigned with owners and due dates.",
        "An incident is closed only when its root cause is recorded and its corrective actions are complete or formally tracked.",
        "Lessons learned are shared, and the related risks in the risk register are reassessed.",
      ],
      roles: [
        ["Everyone", "reports incidents promptly and without fear of blame for reporting."],
        ["Incident owner", "coordinates the response and investigation for an incident."],
        ["Management", "approves corrective actions and monitors them to completion."],
      ],
      monitoring: [
        "Incident volumes, severity, repeat root causes and overdue corrective actions are reported to management [monthly] and to the Board [quarterly].",
      ],
      approver: "[the Board / the executive committee]",
    }
  ),
  template(
    "data-protection",
    "Data Protection Policy",
    "How personal data is collected, used, protected, retained and shared lawfully.",
    { keywords: ["data protection", "privacy", "personal data", "gdpr", "dpia"] },
    {
      purpose:
        "This policy sets out how {{company}} processes personal data lawfully, fairly and securely, and meets its obligations under applicable data protection law.",
      scope: "It applies to all personal data {{company}} processes about customers, employees, suppliers and others, in any format, and to everyone who handles it.",
      definitions: [
        ["Personal data", "any information relating to an identified or identifiable person."],
        ["Special category data", "sensitive personal data such as health, biometric or ethnicity data, which needs extra protection."],
        ["Personal data breach", "a security incident leading to the loss, alteration, disclosure of or access to personal data."],
      ],
      statements: [
        "Personal data is processed only for specified purposes, on a lawful basis, and limited to what is necessary.",
        "{{company}} keeps a record of its processing activities, including purposes, categories of data, recipients and retention periods.",
        "A data protection impact assessment is completed before starting processing likely to be high risk, including large-scale special category data.",
        "Personal data is kept secure, retained only as long as needed, and transferred outside [the jurisdiction] only with appropriate safeguards.",
        "Individuals' rights requests are handled within the legal deadline.",
        "Personal data breaches are reported internally at once; where required, the regulator is notified within 72 hours of becoming aware, and affected individuals without undue delay.",
      ],
      roles: [
        ["Data Protection Officer or lead", "advises, monitors compliance, and is the contact point for the regulator."],
        ["Process owners", "keep their processing activities and records accurate."],
        ["Everyone", "handles personal data in line with this policy and reports breaches immediately."],
      ],
      monitoring: [
        "The record of processing activities is reviewed at least annually.",
        "Breaches, rights requests and DPIAs completed are reported to management [quarterly].",
      ],
      approver: "[the Board / the executive committee]",
    }
  ),
  template(
    "training-awareness",
    "Training and Awareness Policy",
    "Which compliance training is mandatory for whom, how often, and how completion is tracked.",
    { keywords: ["training", "awareness", "learning", "certification", "competenc"] },
    {
      purpose:
        "This policy sets out the compliance training {{company}} requires, who must complete it and how often, so that everyone understands the rules that apply to their role.",
      scope: "It applies to directors, employees and contractors of {{company}}.",
      definitions: [
        ["Mandatory training", "training everyone in a defined group must complete, such as the Code of Ethics, anti-bribery, data protection and health and safety."],
        ["Refresher", "repeat training required when a completion expires."],
      ],
      statements: [
        "Mandatory training and the groups it applies to are listed in the training matrix maintained by [Human Resources / Compliance].",
        "New joiners complete their mandatory training within [30] days of starting.",
        "Each mandatory course has a validity period, usually 12 months, after which a refresher is required.",
        "Higher-risk roles receive additional role-specific training, for example anti-bribery for sales and procurement staff.",
        "Completion is recorded for every person and course, with the completion date.",
        "Persistent non-completion is escalated to the line manager and may be a disciplinary matter.",
      ],
      roles: [
        ["Human Resources or Compliance", "maintains the training matrix and completion records."],
        ["Line managers", "make sure their team completes training on time."],
        ["Everyone", "completes assigned training by its due date."],
      ],
      monitoring: [
        "Completion rates and expired training are reported to management [monthly] and to the Board [annually].",
      ],
      approver: "[the executive committee]",
    }
  ),
];

/** The same document structure in Arabic (spec 031), right to left. */
function documentAr(title: string, s: TemplateSections): string {
  const lines = [
    title,
    "{{company}}",
    "",
    "1. الغرض",
    s.purpose,
    "",
    "2. النطاق",
    s.scope,
    "",
    "3. التعريفات",
    ...s.definitions.map(([term, meaning]) => `- ${term}: ${meaning}`),
    "",
    "4. بنود السياسة",
    ...s.statements.map((text, i) => `4.${i + 1} ${text}`),
    "",
    "5. الأدوار والمسؤوليات",
    ...s.roles.map(([who, duty]) => `- ${who}: ${duty}`),
    "",
    "6. المتابعة والمراجعة",
    ...s.monitoring.map((text, i) => `6.${i + 1} ${text}`),
    "",
    "7. الاعتماد وضبط الإصدارات",
    `تُعتمد هذه السياسة من ${s.approver} وتسري اعتبارًا من تاريخ سريانها. مالك السياسة هو [دور مالك السياسة]. تُراجَع مرة كل 12 شهرًا على الأقل، وقبل ذلك عند حدوث تغيير جوهري في القانون أو الأنظمة أو الأعمال. وتتطلب التغييرات الجوهرية الاعتماد ذاته.`,
  ];
  return lines.join("\n");
}

/** A template in the reader's language (spec 031). Its id, and what it matches, stay the same. */
export function localizeTemplate(template: PolicyTemplate, locale: "en" | "ar"): PolicyTemplate {
  const ar = locale === "ar" ? POLICY_TEMPLATES_AR[template.id] : undefined;
  if (!ar) return template;
  return { ...template, title: ar.title, purpose: ar.purpose, body: documentAr(ar.title, ar.sections) };
}

/** A template's keywords in both languages, so an aspect named in Arabic still finds its template. */
function keywordsOf(template: PolicyTemplate): readonly string[] {
  return [...template.keywords, ...(POLICY_TEMPLATES_AR[template.id]?.keywords ?? [])];
}

export type RankedTemplate = { template: PolicyTemplate; suggested: boolean };

/**
 * The catalogue ordered for an aspect: the template that governs a default
 * aspect of that name first, otherwise the first whose keyword appears in the
 * name, then the rest in catalogue order. At most one is suggested.
 */
export function rankTemplates(aspectName: string, locale: "en" | "ar" = "en"): RankedTemplate[] {
  const name = aspectName.trim().toLowerCase();
  const byName = POLICY_TEMPLATES.find((t) => t.aspectNames.some((n) => n.toLowerCase() === name));
  const byKeyword = byName ?? POLICY_TEMPLATES.find((t) => keywordsOf(t).some((k) => name.includes(k)));
  const ranked = byKeyword
    ? [
        { template: byKeyword, suggested: true },
        ...POLICY_TEMPLATES.filter((t) => t !== byKeyword).map((template) => ({ template, suggested: false })),
      ]
    : POLICY_TEMPLATES.map((template) => ({ template, suggested: false }));
  return ranked.map(({ template, suggested }) => ({ template: localizeTemplate(template, locale), suggested }));
}

/** A template's title and body with the client's name in place of `{{company}}`. */
export function fillTemplate(template: PolicyTemplate, companyName: string): { title: string; body: string } {
  return { title: template.title, body: template.body.replaceAll("{{company}}", companyName) };
}

export function findTemplate(id: string, locale: "en" | "ar" = "en"): PolicyTemplate | undefined {
  const template = POLICY_TEMPLATES.find((t) => t.id === id);
  return template && localizeTemplate(template, locale);
}
