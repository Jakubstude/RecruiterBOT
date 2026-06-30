// ---------------------------------------------------------------------------
// prompts.js - Gemini prompt templates
// ---------------------------------------------------------------------------
window.RECRUITERBOT_PROMPTS = {
    ROLE_FAMILIES: {
        sap_erp: {
            label: "SAP / ERP",
            keywords: ["sap", "erp", "s/4hana", "s4hana", "abap", "fico", "fi/co", "mm", "sd", "pp", "wm", "ewm", "basis", "successfactors", "ariba", "hana"],
            titles: ["SAP Consultant", "SAP Functional Consultant", "SAP Specialist", "ERP Consultant"],
            skills: ["SAP", "S/4HANA", "ABAP", "SAP FI", "SAP CO", "SAP MM", "SAP SD", "SAP PP", "SAP EWM", "SAP Basis", "SAP HANA"]
        },
        data_bi: {
            label: "Data / BI / Analytics",
            keywords: ["data analyst", "bi", "business intelligence", "analytics", "power bi", "tableau", "looker", "sql", "etl", "dwh", "warehouse", "snowflake", "databricks", "python", "dbt"],
            titles: ["Data Analyst", "BI Analyst", "Analytics Engineer", "Business Intelligence Analyst"],
            skills: ["SQL", "Power BI", "Tableau", "Python", "Snowflake", "Databricks", "dbt", "ETL"]
        },
        infra_cloud_devops: {
            label: "Infrastructure / Cloud / DevOps",
            keywords: ["devops", "sre", "cloud", "infrastructure", "aws", "azure", "gcp", "kubernetes", "terraform", "linux", "ci/cd", "platform engineer", "network"],
            titles: ["DevOps Engineer", "Cloud Engineer", "Platform Engineer", "Site Reliability Engineer"],
            skills: ["AWS", "Azure", "GCP", "Kubernetes", "Terraform", "Linux", "Docker", "CI/CD"]
        },
        security: {
            label: "Security",
            keywords: ["security", "cybersecurity", "soc", "siem", "iam", "penetration", "pentest", "vulnerability", "incident response", "iso 27001", "zero trust"],
            titles: ["Security Engineer", "Cyber Security Analyst", "Information Security Specialist", "SOC Analyst"],
            skills: ["SIEM", "SOC", "IAM", "ISO 27001", "Vulnerability Management", "Incident Response", "Splunk"]
        },
        backend: {
            label: "Backend / Software Engineering",
            keywords: ["backend", "back-end", "software engineer", "developer", "java", "python", "node.js", "nodejs", ".net", "c#", "spring", "microservices", "api"],
            titles: ["Backend Engineer", "Software Engineer", "Backend Developer", "Software Developer"],
            skills: ["Java", "Python", "Node.js", ".NET", "C#", "Spring", "Microservices", "REST API"]
        },
        functional_consulting: {
            label: "Business / Functional / Consulting",
            keywords: ["business analyst", "functional consultant", "consultant", "product owner", "project manager", "process analyst", "crm", "requirements", "stakeholder"],
            titles: ["Business Analyst", "Functional Consultant", "Product Owner", "Business Consultant"],
            skills: ["Requirements Analysis", "CRM", "ERP", "UAT", "Process Mapping", "Stakeholder Management"]
        }
    },

    GENERIC_SKILL_REJECTS: [
        "experience", "praxe", "knowledge", "znalost", "communication", "team player",
        "komunikace", "komunikaci", "motivated", "responsible", "independent", "english", "czech", "remote",
        "hybrid", "full time", "part time", "years", "senior", "junior", "medior"
    ],

    normalizeToken(value) {
        return String(value || "")
            .replace(/[“”]/g, '"')
            .replace(/[’]/g, "'")
            .replace(/^[\s"'`.,;:()[\]{}\-–—+*/]+|[\s"'`.,;:()[\]{}\-–—+*/]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
    },

    sanitizeSkillToken(value) {
        let token = this.normalizeToken(value)
            .replace(/^(experience|praxe|knowledge|znalost|skills?)\s+(with|in|of|s|se|v)?\s*/i, "")
            .replace(/^(must have|nice to have|required|preferred)\s*/i, "")
            .trim();
        if (!token) return "";
        const lower = token.toLowerCase();
        if (this.GENERIC_SKILL_REJECTS.some((item) => lower === item || lower.startsWith(`${item} `))) return "";
        if (/[.!?]/.test(token)) return "";
        if (token.length < 2 || token.length > 40) return "";
        if (token.split(/\s+/).length > 4) return "";
        if (/^(with|and|or|for|to|of|in|s|se|v)\b/i.test(token)) return "";
        return token;
    },

    uniqueTokens(items = [], limit = 8) {
        const seen = new Set();
        const out = [];
        items.forEach((item) => {
            const cleaned = this.sanitizeSkillToken(item);
            const key = cleaned.toLowerCase();
            if (!cleaned || seen.has(key)) return;
            seen.add(key);
            out.push(cleaned);
        });
        return out.slice(0, limit);
    },

    detectRoleFamily(jd) {
        const text = String(jd || "").toLowerCase();
        const scored = Object.entries(this.ROLE_FAMILIES).map(([id, config]) => {
            const score = config.keywords.reduce((sum, keyword) => {
                const pattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const matches = text.match(new RegExp(`\\b${pattern}\\b`, "gi"));
                return sum + (matches ? matches.length : 0);
            }, 0);
            return { id, label: config.label, score };
        }).sort((a, b) => b.score - a.score);
        const best = scored[0];
        return best && best.score > 0 ? best : { id: "backend", label: this.ROLE_FAMILIES.backend.label, score: 0 };
    },

    extractLocationTerms(jd) {
        const text = String(jd || "");
        const known = ["Prague", "Praha", "Brno", "Ostrava", "Czech Republic", "Czechia", "Slovakia", "Poland", "Germany"];
        return known.filter((place) => new RegExp(`\\b${place}\\b`, "i").test(text)).slice(0, 2);
    },

    extractHardSkills(jd, familyId) {
        const config = this.ROLE_FAMILIES[familyId] || this.ROLE_FAMILIES.backend;
        const text = String(jd || "");
        const knownMatches = [];
        Object.values(this.ROLE_FAMILIES).flatMap((family) => family.skills).forEach((skill) => {
            const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) knownMatches.push(skill);
        });
        const slashTerms = text.match(/\b[A-Za-z][A-Za-z0-9+#.]*(?:\/[A-Za-z0-9+#.]+)+\b/g) || [];
        const explicitTerms = text.match(/\b(?:SAP\s+[A-Z]{2,4}|S\/4HANA|Power BI|Node\.js|\.NET|C#|C\+\+|CI\/CD|ISO\s*27001|REST API)\b/gi) || [];
        const capitalizedTech = text.match(/\b[A-Z][A-Za-z0-9+#.]{1,}(?:\s+[A-Z][A-Za-z0-9+#.]{1,})?\b/g) || [];
        return this.uniqueTokens([...knownMatches, ...explicitTerms, ...slashTerms, ...capitalizedTech, ...config.skills], 6);
    },

    extractTitleHints(jd, familyId) {
        const config = this.ROLE_FAMILIES[familyId] || this.ROLE_FAMILIES.backend;
        const text = String(jd || "");
        const titleMatches = [
            text.match(/\b(?:senior|junior|lead|principal|staff)?\s*(SAP Consultant|Data Analyst|BI Analyst|DevOps Engineer|Cloud Engineer|Security Engineer|Backend Engineer|Software Engineer|Business Analyst|Functional Consultant|Product Owner)\b/i)?.[0]
        ].filter(Boolean);
        return this.uniqueTokens([...titleMatches, ...config.titles], 4);
    },

    buildSearchPlan(jd, aiTerms = "") {
        const family = this.detectRoleFamily(jd);
        const aiSkills = String(aiTerms || "").match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) || [];
        const titles = this.extractTitleHints(jd, family.id);
        const hardSkills = this.uniqueTokens([...this.extractHardSkills(jd, family.id), ...aiSkills], 5);
        const locations = this.extractLocationTerms(jd);
        const googleTitleBlock = `(${titles.map((title) => `"${title}"`).join(" OR ")})`;
        const googleSkillBlock = hardSkills.slice(0, 3).map((skill) => `"${skill}"`).join(" ");
        const locationBlock = locations.length ? ` (${locations.map((place) => `"${place}"`).join(" OR ")})` : "";
        const googleTerms = `${googleTitleBlock} ${googleSkillBlock}${locationBlock}`.trim();
        const linkedinTerms = [...titles.slice(0, 2), ...hardSkills.slice(0, 3), ...locations.slice(0, 1)].join(" ");
        const googleQuery = this.buildSafeLinkedInXrayQuery(googleTerms);
        return {
            role_family: family.id,
            role_family_label: family.label,
            titles,
            hard_skills: hardSkills,
            locations,
            google_terms: googleTerms,
            google_query: googleQuery,
            linkedin_query: linkedinTerms,
            debug: {
                role_family: family.label,
                titles,
                hard_skills: hardSkills,
                google_query: googleQuery,
                linkedin_query: linkedinTerms
            }
        };
    },

    buildSafeLinkedInXrayQuery(aiQuery) {
        const LINKEDIN_PREFIX = '(site:linkedin.com/in OR site:cz.linkedin.com/in OR site:www.linkedin.com/in)';
        const LINKEDIN_EXCLUSIONS = '-inurl:dir -inurl:directory -intitle:"profiles" -intitle:"directory"';
        const cleaned = String(aiQuery || "")
            .replace(/^```.*$/gm, "")
            .replace(/`/g, "")
            .replace(/^\s*site:[^\s]+/gi, "")
            .replace(/\binurl:[^\s]+/gi, "")
            .replace(/\bintitle:[^\s]+/gi, "")
            .replace(/\s+/g, " ")
            .trim();
        return `${LINKEDIN_PREFIX} ${cleaned} ${LINKEDIN_EXCLUSIONS}`.trim();
    },

    buildBooleanPrompt(jd) {
        return `You are an expert tech sourcer. From the following Job Description, produce ONLY the relevant query terms for a Google X-Ray search of LinkedIn profiles.

Return EXACTLY this format on ONE line, NOTHING else:
(<job-title-OR-block>) (<must-have-skill-1>) (<must-have-skill-2>) [<location>]

Rules:
- First infer the role family: SAP/ERP, Data/BI, Infra/Cloud/DevOps, Security, Backend/Software, or Functional/Consulting.
- Choose titles and hard skills that fit that role family; avoid generic internal job-title wording.
- Job-title-OR-block: 2-4 synonyms separated by OR, each in quotes. Example: ("Java Developer" OR "Backend Engineer" OR "Software Engineer")
- 2-3 must-have hard skills as separate quoted tokens (no soft skills, no "Praxe", no "Experience").
- SAP/ERP: prefer SAP modules, ERP terms, S/4HANA, ABAP, FI/CO/MM/SD/etc.
- Data/BI: prefer SQL, BI tools, DWH/ETL/cloud data stack terms.
- Infra/Cloud/DevOps: prefer cloud platforms, Kubernetes, Terraform, Linux, CI/CD.
- Security: prefer security titles and SIEM/IAM/SOC/vulnerability/incident-response terms.
- Backend: prefer engineering titles and core language/platform skills.
- Functional/Consulting: prefer market titles like Business Analyst, Functional Consultant, Product Owner.
- Optional location ONLY if explicitly named in the JD (e.g. "Prague" OR "Czech Republic").
- DO NOT include "site:" or "inurl:" or any LinkedIn directives — the extension wraps them automatically.
- DO NOT include markdown, comments, or extra text. Just the raw query terms.

JD:
${jd}`;
    },

    buildSearchPlanPrompt(jd) {
        return `You are an expert tech recruiter / sourcer.

Produce a sourcing plan based on the Job Description below.

Return ONLY this exact plain-text format (no JSON, no markdown):

ROLE_COUNT: 1 or 2

ROLE_1_LABEL: ...
ROLE_1_TITLES: title1 | title2 | title3
ROLE_1_FALLBACK_TITLES: ... | ...
ROLE_1_MUST_HAVE_SKILLS: ... | ... | ...
ROLE_1_NICE_TO_HAVE_SKILLS: ... | ...

ROLE_2_LABEL: ...
ROLE_2_TITLES: ...
ROLE_2_FALLBACK_TITLES: ...
ROLE_2_MUST_HAVE_SKILLS: ...
ROLE_2_NICE_TO_HAVE_SKILLS: ...

LOCATION_CITY: ...
LOCATION_COUNTRY: ...
LOCATION_REGION: ...
LOCATION_EXPLICIT: yes or no

LANGUAGES: English | ...
WORK_MODE: onsite | hybrid | remote | unknown
SCOPE: local | global | remote
INVITE_MESSAGE: <short LinkedIn invite, max 280 chars>

Rules:
- Prefer real market titles candidates use on LinkedIn.
- 2-6 MUST_HAVE_SKILLS, pure hard skills.
- Invite message: natural, first person, max 280 chars.

JD:
${jd}`;
    },

    buildScoringPrompt(candidate, jd) {
        const sourceLabel = candidate?.source === "linkedin" ? "LinkedIn" : candidate?.source === "google" ? "Google" : "search";
        const depthLabel = candidate?.data_depth === "full_profile" ? "full profile" : "result-card/snippet";
        const profilePayload = candidate?.profile_payload || {};
        const profileLines = profilePayload?.name || profilePayload?.headline || profilePayload?.skills?.length
            ? [
                `PROFILE_NAME=${profilePayload.name || ""}`,
                `PROFILE_HEADLINE=${profilePayload.headline || ""}`,
                `PROFILE_LOCATION=${profilePayload.location || ""}`,
                `PROFILE_SKILLS=${(profilePayload.skills || []).join(", ")}`,
                `PROFILE_ABOUT=${String(profilePayload.about || "").slice(0, 600)}`
            ].join("\n")
            : "PROFILE_DATA=none";

        return `You are an expert recruiter. Score ONE candidate against the Job Description below.

Important rules:
- Treat result-card/snippet evidence as weak-confidence input.
- If full-profile data is available, prioritize it and weigh title, seniority, skills, and experience more heavily.
- Keep the reason concise, practical, and recruiter-friendly.

Return EXACTLY ONE LINE in this format and nothing else:
${candidate.index}: NN% - short reason in English

Where NN is an integer 0-100.

Scoring guidance:
- 80-100: title + key skills clearly match
- 60-79: title matches OR key skills match, partial fit
- 40-59: adjacent role / partial overlap
- 20-39: weak overlap, likely not relevant
- 0-19: clearly unrelated or not enough info

JD:
${jd}

Candidate context:
SOURCE=${sourceLabel}
DATA_DEPTH=${depthLabel}
TITLE=${candidate.title || candidate.name || ""}
URL=${candidate.url || ""}
SNIPPET=${candidate.text || ""}
${profileLines}`;
    }
};
