# Community Skills

Place your custom skill files here.

Each skill is a `.md` file with frontmatter:

```markdown
---
slug: my-skill
name: My Skill
description: What this skill teaches agents.
category: coding
triggers:
  keywords: [keyword1, keyword2, keyword3]
  patterns: [".*some pattern.*"]
---

# My Skill

Content that gets injected into the agent's context when relevant...
```

You can also import skills from URLs in the dashboard under **Settings → Skills → Import from URL**.

## Folder Structure

```
skills/
  builtin/       ← Default skills shipped with Arvis (don't edit)
  community/     ← Your custom skills go here (this folder)
```
