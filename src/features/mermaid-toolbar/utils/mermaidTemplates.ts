export interface MermaidTemplate {
  id: string;
  /** The Diagram menu item */
  name: string;
  /** The palette row: `name` mid-sentence; acronyms and names keep their capitals */
  insertLabel: string;
  description: string;
  template: string;
}

export const mermaidTemplates: MermaidTemplate[] = [
  {
    id: 'flowchart',
    name: 'Flowchart',
    insertLabel: 'Insert flowchart',
    description: 'Basic flowchart with decision points',
    template: `\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\``,
  },
  {
    id: 'sequence',
    name: 'Sequence diagram',
    insertLabel: 'Insert sequence diagram',
    description: 'Interaction between participants',
    template: `\`\`\`mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob!
    B-->>A: Hi Alice!
    A->>B: How are you?
    B-->>A: I'm good, thanks!
\`\`\``,
  },
  {
    id: 'classDiagram',
    name: 'Class diagram',
    insertLabel: 'Insert class diagram',
    description: 'Object-oriented class structure',
    template: `\`\`\`mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat
\`\`\``,
  },
  {
    id: 'stateDiagram',
    name: 'State diagram',
    insertLabel: 'Insert state diagram',
    description: 'State machine visualization',
    template: `\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Success: Complete
    Processing --> Error: Fail
    Success --> [*]
    Error --> Idle: Retry
\`\`\``,
  },
  {
    id: 'erDiagram',
    name: 'ER diagram',
    insertLabel: 'Insert ER diagram',
    description: 'Entity relationship diagram',
    template: `\`\`\`mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    CUSTOMER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        date created
        string status
    }
\`\`\``,
  },
  {
    id: 'gantt',
    name: 'Gantt chart',
    insertLabel: 'Insert Gantt chart',
    description: 'Project timeline visualization',
    template: `\`\`\`mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Planning
        Research       :a1, 2024-01-01, 7d
        Design         :a2, after a1, 5d
    section Development
        Implementation :a3, after a2, 14d
        Testing        :a4, after a3, 7d
    section Launch
        Deployment     :a5, after a4, 3d
\`\`\``,
  },
  {
    id: 'pie',
    name: 'Pie chart',
    insertLabel: 'Insert pie chart',
    description: 'Data distribution chart',
    template: `\`\`\`mermaid
pie showData
    title Browser Market Share
    "Chrome" : 65
    "Firefox" : 15
    "Safari" : 12
    "Edge" : 8
\`\`\``,
  },
  {
    id: 'mindmap',
    name: 'Mind map',
    insertLabel: 'Insert mind map',
    description: 'Hierarchical idea visualization',
    template: `\`\`\`mermaid
mindmap
  root((Project))
    Planning
      Research
      Design
    Development
      Frontend
      Backend
    Testing
      Unit Tests
      Integration
\`\`\``,
  },
];
