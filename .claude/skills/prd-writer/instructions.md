# PRD Writer Instructions

## Trigger
Use this skill when the user asks to:
- Create a PRD
- Write a product requirements document
- Plan a feature for Ralph loop
- Generate tasks for autonomous development
- Convert requirements to Ralph format

## Usage

```
/skill prd-writer "Add user authentication with better-auth"
```

Or simply describe what you want to build:
```
"Create a PRD for adding Stripe payments to my SaaS app"
```

## Output

1. Ask clarifying questions if scope is unclear
2. Generate a complete PRD following the schema in skill.md
3. Save to `.agents/tasks/prd-{slug}.json`
4. Create an overview at `.agents/tasks/prd-{slug}.overview.md`
5. Display summary of stories and estimated iterations

## Files Modified
- `.agents/tasks/prd-{slug}.json` - The PRD file
- `.agents/tasks/prd-{slug}.overview.md` - Human-readable summary
