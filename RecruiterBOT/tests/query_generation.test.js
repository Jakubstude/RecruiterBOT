const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'prompts.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const PROMPTS = context.window.RECRUITERBOT_PROMPTS;

test('buildSearchPlan detects SAP ERP roles and keeps SAP-specific skills', () => {
  const plan = PROMPTS.buildSearchPlan('Senior SAP FI CO Consultant for S/4HANA rollout, ABAP integration, Prague.');

  assert.equal(plan.role_family, 'sap_erp');
  assert.match(plan.google_query, /site:linkedin\.com\/in/);
  assert.match(plan.google_query, /SAP/);
  assert.match(plan.google_query, /S\/4HANA|ABAP|SAP FI/);
  assert.ok(plan.linkedin_query.length < plan.google_query.length);
});

test('buildSearchPlan detects Data BI roles with analytics titles and tools', () => {
  const plan = PROMPTS.buildSearchPlan('Data BI Analyst with SQL, Power BI, Tableau, Snowflake and ETL experience.');

  assert.equal(plan.role_family, 'data_bi');
  assert.ok(plan.titles.some((title) => /data|bi|analytics/i.test(title)));
  assert.ok(plan.hard_skills.some((skill) => /SQL|Power BI|Tableau|Snowflake/i.test(skill)));
});

test('buildSearchPlan detects Infra Cloud DevOps roles', () => {
  const plan = PROMPTS.buildSearchPlan('DevOps Cloud Engineer needed for AWS, Kubernetes, Terraform, Linux and CI/CD platform work.');

  assert.equal(plan.role_family, 'infra_cloud_devops');
  assert.ok(plan.titles.some((title) => /DevOps|Cloud|Platform|Reliability/i.test(title)));
  assert.ok(plan.hard_skills.some((skill) => /AWS|Kubernetes|Terraform|Linux/i.test(skill)));
});

test('buildSearchPlan detects Security roles', () => {
  const plan = PROMPTS.buildSearchPlan('Cybersecurity SOC analyst with SIEM, IAM, vulnerability management and incident response.');

  assert.equal(plan.role_family, 'security');
  assert.ok(plan.titles.some((title) => /Security|SOC|Cyber/i.test(title)));
  assert.ok(plan.hard_skills.some((skill) => /SIEM|IAM|SOC|Incident/i.test(skill)));
});

test('buildSearchPlan detects Backend roles', () => {
  const plan = PROMPTS.buildSearchPlan('Backend Software Engineer working with Java, Spring, REST API and microservices.');

  assert.equal(plan.role_family, 'backend');
  assert.ok(plan.titles.some((title) => /Backend|Software/i.test(title)));
  assert.ok(plan.hard_skills.some((skill) => /Java|Spring|REST API|Microservices/i.test(skill)));
});

test('buildSearchPlan detects Functional Consulting roles', () => {
  const plan = PROMPTS.buildSearchPlan('Business Analyst / Functional Consultant for CRM requirements, UAT and stakeholder workshops.');

  assert.equal(plan.role_family, 'functional_consulting');
  assert.ok(plan.titles.some((title) => /Business Analyst|Functional Consultant|Product Owner/i.test(title)));
  assert.ok(plan.hard_skills.some((skill) => /CRM|UAT|Requirements/i.test(skill)));
});

test('sanitizeSkillToken rejects weak fragments and keeps hard skills', () => {
  assert.equal(PROMPTS.sanitizeSkillToken('experience with SQL'), 'SQL');
  assert.equal(PROMPTS.sanitizeSkillToken('praxe s komunikaci'), '');
  assert.equal(PROMPTS.sanitizeSkillToken('team player'), '');
  assert.equal(PROMPTS.sanitizeSkillToken('Power BI'), 'Power BI');
});
