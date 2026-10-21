export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'development' | 'documentation' | 'personal';
  content: string;
}

const currentDate = () => {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Bodies are plain Markdown files named by template id; they load with this module's lazy chunk.
const BODIES = import.meta.glob('./templates/*.md', { query: '?raw', import: 'default', eager: true });

// The list order is the order shown in the dialog.
const TEMPLATE_INFO: Omit<Template, 'content'>[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Template for capturing meeting notes and action items',
    category: 'general',
  },
  {
    id: 'project-brief',
    name: 'Project brief',
    description: 'Quick project overview and requirements',
    category: 'general',
  },
  {
    id: 'readme',
    name: 'README',
    description: 'Standard README template for projects',
    category: 'development',
  },
  {
    id: 'api-doc',
    name: 'API documentation',
    description: 'Document API endpoints',
    category: 'development',
  },
  {
    id: 'changelog',
    name: 'Changelog',
    description: 'Keep a changelog for your project',
    category: 'development',
  },
  {
    id: 'technical-spec',
    name: 'Technical specification',
    description: 'Detailed technical specification document',
    category: 'documentation',
  },
  {
    id: 'user-guide',
    name: 'User guide',
    description: 'End-user documentation template',
    category: 'documentation',
  },
  {
    id: 'daily-journal',
    name: 'Daily journal',
    description: 'Daily reflection and planning',
    category: 'personal',
  },
  {
    id: 'blog-post',
    name: 'Blog post',
    description: 'Structure for writing blog posts',
    category: 'personal',
  },
];

// Git may check the files out with CRLF on Windows; inserted documents stay LF.
function bodyOf(id: string): string {
  const key = `./templates/${id}.md`;

  if (!(key in BODIES)) throw new Error(`Template body missing: templates/${id}.md`);

  return BODIES[key].replace(/\r\n?/g, '\n');
}

export const builtInTemplates: Template[] = TEMPLATE_INFO.map((info) => ({ ...info, content: bodyOf(info.id) }));

// Search templates
export function searchTemplates(query: string): Template[] {
  const lowerQuery = query.toLowerCase();

  return builtInTemplates.filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery)
  );
}

// Fill {{date}} when the template is used, so a long-running app never inserts a stale date
export function processTemplate(content: string): string {
  return content.replace(/\{\{date\}\}/g, currentDate());
}
