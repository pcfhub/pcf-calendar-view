---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- A Dataverse environment. The calendar binds a view, so there is nothing to
  show without one.
- A **date column** on the table — Date Only or Date and Time — to place
  events by. A second one for the end is optional; a **text column** for the
  title is required.
- For canvas apps and custom pages, the environment feature **Power Apps
  component framework for canvas apps** must be on: *Admin centre* →
  *Environments* → *Settings* → *Product* → *Features*. It is already on for
  model-driven apps.

## The permission prompts

Importing the solution asks the maker to consent to two things, and both are
the second route rather than the first:

- **Web API.** A move is written through the record itself wherever the
  platform reports the start column as editable — no feature, no prompt. Where
  it does not, the control falls back to `updateRecord`, which is what this
  consent covers. It runs as the signed-in user and is subject to their
  privileges.
- **Utility.** Reading each bound date column's *Behavior* — whether a value
  is a whole day or an instant in the user's zone — and the colour column's
  option colours, through `getEntityMetadata`. Without it the control places
  events by the shape of each value, which is right for the common cases and
  wrong for a User Local column whose value happens to fall on UTC midnight.

Nothing else is requested — no device access and no external services.

:::callout{type=info}
Consenting is not the same as granting access. A user who cannot update the
record through any other route cannot update it by dragging an event either;
the write is refused and the event returns to its day.
:::

## Upgrading

Import the newer managed solution over the older one and publish. The solution's
unique name does not change between releases, so an import upgrades in place
rather than installing a second copy.

Canvas apps are the exception: a canvas app holds its own copy of the control,
so after importing, open each app that uses the calendar, accept the **Update
code components** prompt, then save and publish.
