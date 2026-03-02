---
slug: code-review
name: Code Review
description: How to review code effectively — what to look for, how to give feedback, and common issues to catch.
category: coding
triggers:
  keywords: [review, code review, PR, pull request, feedback, refactor, smell, bug, issue, improve, optimize]
  patterns: [".*review.*code.*", ".*look at.*code.*", ".*what.*wrong.*", ".*improve.*this.*"]
---

# Code Review

## What To Look For

### Correctness
- Does the code do what it claims to do?
- Are edge cases handled? (empty arrays, null/undefined, negative numbers, empty strings)
- Are errors caught and handled properly?
- Are there off-by-one errors in loops?

### Security
- SQL injection: are queries parameterized?
- XSS: is user input sanitized before rendering?
- Are secrets hardcoded? (should be in env vars)
- Is auth checked before sensitive operations?

### Performance
- Are there N+1 query problems? (loop making DB calls)
- Are expensive operations called in hot paths unnecessarily?
- Are large arrays/objects copied when they don't need to be?

### Readability
- Are variable and function names clear and descriptive?
- Is the code doing too many things in one function? (should split)
- Are there magic numbers/strings that should be named constants?
- Is the logic easy to follow without heavy comments?

### Maintainability
- Is there duplicated logic that should be extracted?
- Are there unnecessary abstractions making it harder to understand?
- Will this be easy to modify in 6 months?

## How To Give Feedback
- Be specific: point to the exact line and explain the issue
- Explain WHY it's a problem, not just that it is
- Suggest a fix or alternative when possible
- Separate blocking issues from suggestions (nitpicks)
- Acknowledge good code too — not every comment has to be negative
