---
title: API reference
description: Properties, column roles and outputs, generated from the control manifest.
order: 5
---

# API reference

## Input properties

::props-table{kind=input}

**Events per fetch** carries no default on purpose: left empty, the control
adopts the page size the host is already retrieving with and never calls
`setPageSize`. **Week starts on** is `auto` for the same reason — it follows
the user's personal options unless you fix it. **Opens on** is empty for
today; set a `yyyy-MM-dd` for a calendar of a known period.

## Dataset

::props-table{kind=dataset}

## Column roles

The calendar assigns meaning to specific columns rather than rendering
whatever the view supplies, so each role below is bound to a column in your
own table.

::props-table{kind=dataset_column}

:::callout{type=warning}
**Every column bound to a role must be in the view.** The roles are read
through the dataset, so a role bound to a column the view does not select
arrives empty.
:::

**Start** and **End** accept either date format; the column's *behaviour*
(User Local, Date Only, Time Zone Independent) is read from metadata at
runtime and decides how the value is placed — see
[Model-driven apps](model-driven.md#how-a-date-is-placed). **Colour** must be
a choice column; its option colours come from the option set's metadata.

## Outputs

::props-table{kind=output}

`selectedDate` is the day last clicked or moved to, as `yyyy-MM-dd`. The
three record ids are unbraced and lower-case, the spelling the dataset uses,
and are notified *before* the platform call they describe — so a form can
observe the intent even on a host where the call does nothing. An empty
string means nothing has happened yet.
