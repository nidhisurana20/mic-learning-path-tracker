# data/cert_data.py
#
# Hand-compiled dataset of free Microsoft certifications / Microsoft Learn
# paths, grouped by domain. Each cert lists its prerequisites by id — this
# prerequisite graph is the ONLY thing the "available / locked" logic uses.
# (Researched from learn.microsoft.com/credentials as of Aug 2026 — Microsoft
# occasionally renames/renumbers exams, e.g. AI-900 -> AI-901, so double
# check the live catalog before relying on this for real advising.)

DOMAINS = [
    {"id": "cloud", "name": "Cloud"},
    {"id": "ai-data", "name": "AI / Data"},
    {"id": "security", "name": "Security"},
]

CERTS = [
    # ---- Cloud ----
    {
        "id": "az-900",
        "domain": "cloud",
        "name": "Microsoft Certified: Azure Fundamentals (AZ-900)",
        "level": "Fundamentals",
        "prerequisites": [],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/",
    },
    {
        "id": "az-104",
        "domain": "cloud",
        "name": "Microsoft Certified: Azure Administrator Associate (AZ-104)",
        "level": "Associate",
        "prerequisites": ["az-900"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator/",
    },
    {
        "id": "az-204",
        "domain": "cloud",
        "name": "Microsoft Certified: Azure Developer Associate (AZ-204)",
        "level": "Associate",
        "prerequisites": ["az-900"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-developer/",
    },
    {
        "id": "az-305",
        "domain": "cloud",
        "name": "Microsoft Certified: Azure Solutions Architect Expert (AZ-305)",
        "level": "Expert",
        "prerequisites": ["az-104"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-solutions-architect/",
    },
    # ---- AI / Data ----
    {
        "id": "ai-901",
        "domain": "ai-data",
        "name": "Microsoft Certified: Azure AI Fundamentals (AI-901)",
        "level": "Fundamentals",
        "prerequisites": [],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-fundamentals/",
    },
    {
        "id": "dp-900",
        "domain": "ai-data",
        "name": "Microsoft Certified: Azure Data Fundamentals (DP-900)",
        "level": "Fundamentals",
        "prerequisites": [],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-data-fundamentals/",
    },
    {
        "id": "ai-102",
        "domain": "ai-data",
        "name": "Microsoft Certified: Azure AI Engineer Associate (AI-102)",
        "level": "Associate",
        "prerequisites": ["ai-901"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-engineer/",
    },
    {
        "id": "dp-100",
        "domain": "ai-data",
        "name": "Microsoft Certified: Azure Data Scientist Associate (DP-100)",
        "level": "Associate",
        "prerequisites": ["dp-900", "ai-901"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-data-scientist/",
    },
    # ---- Security ----
    {
        "id": "sc-900",
        "domain": "security",
        "name": "Microsoft Certified: Security, Compliance, and Identity Fundamentals (SC-900)",
        "level": "Fundamentals",
        "prerequisites": [],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/security-compliance-and-identity-fundamentals/",
    },
    {
        "id": "sc-300",
        "domain": "security",
        "name": "Microsoft Certified: Identity and Access Administrator Associate (SC-300)",
        "level": "Associate",
        "prerequisites": ["sc-900"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/identity-and-access-administrator/",
    },
    {
        "id": "sc-200",
        "domain": "security",
        "name": "Microsoft Certified: Security Operations Analyst Associate (SC-200)",
        "level": "Associate",
        "prerequisites": ["sc-900"],
        "url": "https://learn.microsoft.com/en-us/credentials/certifications/security-operations-analyst/",
    },
]
