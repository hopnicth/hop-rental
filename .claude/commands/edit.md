---
description: Edit/add code while keeping index and descriptions in sync
argument-hint: <what to change or add>
---

# Edit Routine

You are handling a change request for this project. The request is:

> $ARGUMENTS

The project maintains two things that MUST stay in sync with the code:
- an **index** (the lookup/map of components)
- a **des** (description) for each indexed item

Follow these steps in order. Do not skip steps.

## 1. Analyze
Restate the request in one line and decide whether it is an **EDIT** (changing
something that already exists) or an **ADD** (introducing something new).

## 2. Locate
Look up the **index** and open the entries most likely related to this request.
List the files/sections you will touch before changing anything.

## 3. Read the description
Read the **des** of each relevant item so you understand current intent and the
exact format descriptions are written in. Match that format later.

## 4. Make the change

### If EDIT:
- Make the code change.
- Update the **des** to reflect the new behavior.
- **Overwrite the des in place — do NOT keep old versions, changelogs, or
  "previously this did X" notes.** The des should read as if it was always
  correct.

### If ADD:
- Add the new code.
- Add a new entry to the **index** for it.
- Write a new **des** for it, following the same format as existing entries.

## 5. Verify
Confirm that code, index, and des are consistent with each other. If you changed
code but left the index or des stale, fix it now. Never leave them out of sync.

## Output
Briefly report: what changed, which index entries were touched, and which des
were updated or added.
