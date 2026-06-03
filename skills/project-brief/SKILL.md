---
name: project-brief
description: Project Brief Skill
category: productivity
maturity: stable
tags: [project-status, brief, goals, blockers, tracking]
---

# Project Brief Skill

Use when: starting a new project, updating a project's status, or when the user asks "what's the status of X?"

## Create a brief for a new project

node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs new \
 --project <name> \
 --goal "What this project does and why" \
 --success "criterion 1,criterion 2,criterion 3" \
 --constraints "constraint 1,constraint 2" \
 --stack "tech1,tech2" \
 --status "Active" \
 --next "first next action,second next action"

## List all projects with briefs

node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs list

## Compact status overview

node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs status

## View a project's brief

node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs view <project>

## Update a brief

node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --status "Complete"
node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --add-next "New action item"
node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --check "Success criterion text"
node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --add-history "What changed today"
node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --add-blocker "What's blocking"
node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --resolve-blocker "What's blocking"
node ${PROJECT_BRIEF_HOME:-$HOME/projects/project-brief}/brief.cjs update <project> --current-status "One-liner on current state"

## Briefs live at

~/projects/<project>/BRIEF.md

## When to update

- When a project's status changes
- When a blocker appears or is resolved
- When a milestone is hit
- When the user says "note that X is done"
