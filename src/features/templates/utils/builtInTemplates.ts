export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'development' | 'documentation' | 'personal';
  content: string;
  icon?: string;
}

const currentDate = () => {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const builtInTemplates: Template[] = [
  // General
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Template for capturing meeting notes and action items',
    category: 'general',
    content: `# Meeting Notes

**Date:** ${currentDate()}
**Attendees:**

## Agenda

1.
2.
3.

## Discussion Notes



## Action Items

- [ ]
- [ ]
- [ ]

## Next Steps



## Next Meeting

**Date:**
**Topics:**
`,
  },
  {
    id: 'project-brief',
    name: 'Project brief',
    description: 'Quick project overview and requirements',
    category: 'general',
    content: `# Project Brief

## Overview

**Project Name:**
**Start Date:** ${currentDate()}
**Target Completion:**

## Objectives

-
-
-

## Scope

### In Scope
-

### Out of Scope
-

## Stakeholders

| Role | Name | Contact |
|------|------|---------|
| | | |

## Success Criteria

1.
2.
3.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| | | |
`,
  },

  // Development
  {
    id: 'readme',
    name: 'README',
    description: 'Standard README template for projects',
    category: 'development',
    content: `# Project Name

Brief description of what this project does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/username/project.git

# Install dependencies
npm install
\`\`\`

## Usage

\`\`\`bash
npm start
\`\`\`

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| | | |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
`,
  },
  {
    id: 'api-doc',
    name: 'API documentation',
    description: 'Document API endpoints',
    category: 'development',
    content: `# API Documentation

## Base URL

\`\`\`
https://api.example.com/v1
\`\`\`

## Authentication

All requests require an API key in the header:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

## Endpoints

### GET /resource

Returns a list of resources.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Items per page |

**Response**

\`\`\`json
{
  "data": [],
  "pagination": {
    "page": 1,
    "total": 100
  }
}
\`\`\`

### POST /resource

Creates a new resource.

**Request Body**

\`\`\`json
{
  "name": "string",
  "description": "string"
}
\`\`\`

**Response**

\`\`\`json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "createdAt": "string"
}
\`\`\`

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 500 | Server Error |
`,
  },
  {
    id: 'changelog',
    name: 'Changelog',
    description: 'Keep a changelog for your project',
    category: 'development',
    content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
-

### Changed
-

### Deprecated
-

### Removed
-

### Fixed
-

### Security
-

## [1.0.0] - ${currentDate()}

### Added
- Initial release
`,
  },

  // Documentation
  {
    id: 'technical-spec',
    name: 'Technical specification',
    description: 'Detailed technical specification document',
    category: 'documentation',
    content: `# Technical Specification

## Document Info

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Date | ${currentDate()} |
| Author | |
| Status | Draft |

## Overview

### Problem Statement


### Proposed Solution


## Architecture

### System Diagram

\`\`\`mermaid
graph TB
    A[Client] --> B[API Gateway]
    B --> C[Service]
    C --> D[Database]
\`\`\`

### Components

#### Component 1


#### Component 2


## Data Model

### Entity Relationship

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ITEM : contains
\`\`\`

## API Design


## Security Considerations


## Performance Requirements


## Testing Strategy


## Deployment Plan


## Open Questions

- [ ]
`,
  },
  {
    id: 'user-guide',
    name: 'User guide',
    description: 'End-user documentation template',
    category: 'documentation',
    content: `# User Guide

## Getting Started

### Requirements

- Requirement 1
- Requirement 2

### Quick Start

1. Step 1
2. Step 2
3. Step 3

## Features

### Feature 1

Description of feature 1.

#### How to Use

1.
2.
3.

### Feature 2

Description of feature 2.

## FAQ

### Question 1?

Answer 1.

### Question 2?

Answer 2.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| | |

## Support

For additional help:
- Email: support@example.com
- Documentation: https://docs.example.com
`,
  },

  // Personal
  {
    id: 'daily-journal',
    name: 'Daily journal',
    description: 'Daily reflection and planning',
    category: 'personal',
    content: `# Daily Journal - ${currentDate()}

## Morning Reflection

### How am I feeling today?


### What am I grateful for?

1.
2.
3.

## Today's Focus

### Top 3 Priorities

1. [ ]
2. [ ]
3. [ ]

### Other Tasks

- [ ]
- [ ]

## Notes & Ideas


## Evening Review

### What went well?


### What could be improved?


### Tomorrow's intention:

`,
  },
  {
    id: 'blog-post',
    name: 'Blog post',
    description: 'Structure for writing blog posts',
    category: 'personal',
    content: `# Blog Post Title

![Cover Image](url)

**Published:** ${currentDate()}
**Tags:** tag1, tag2, tag3

## Introduction

Hook your readers with an engaging opening.

## Main Content

### Section 1


### Section 2


### Section 3


## Key Takeaways

1.
2.
3.

## Conclusion

Wrap up your post and include a call to action.

---

*What are your thoughts? Share in the comments below!*
`,
  },
];

// Get templates by category
export function getTemplatesByCategory(category: Template['category']): Template[] {
  return builtInTemplates.filter(t => t.category === category);
}

// Search templates
export function searchTemplates(query: string): Template[] {
  const lowerQuery = query.toLowerCase();
  return builtInTemplates.filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery)
  );
}

// Process template variables
export function processTemplate(content: string, variables: Record<string, string> = {}): string {
  let processed = content;

  // Replace {{date}} with current date
  processed = processed.replace(/\{\{date\}\}/g, currentDate());

  // Replace custom variables
  for (const [key, value] of Object.entries(variables)) {
    processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return processed;
}
