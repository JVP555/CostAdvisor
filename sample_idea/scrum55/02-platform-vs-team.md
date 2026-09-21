# Platform vs Team (and how 'forking' works)

This is the most important rule in the data model. It's also new ground for us — the forking part doesn't exist in the code yet, so I want to walk through it properly. It's a simple idea, but it quietly controls a lot — worth going slow.

## Two owners of data

Here's the shape of it. Almost every row in the app belongs to one of two owners:

- **Platform** — shipped by us. Shared by everyone. The starting set.
- **Team** — owned by one customer. Private to them.

And there's one field that tells you which is which: **team_id**.

- team_id is **empty (NULL)** -> it's a **platform** row (ours, shared).
- team_id is **set** -> it's a **team** row (theirs, private).

## What 'forking' means

So a customer can take a platform thing and make their own editable copy of it. That copy is what we call a **fork**.

```
Platform family 'Surfactants'  (team_id = NULL)
        |
        |  team clicks 'customize'
        v
Team family 'Surfactants (Acme)'  (team_id = Acme, origin_id = the platform one)
```

The fork is theirs now. They can rename it, re-price it, change whatever they want. And here's why this matters for a category manager. Two customers in the same category will genuinely disagree about how a product is built or priced. They buy it differently — different suppliers, different volumes, different contracts. So a fork has to be fully theirs. It does NOT touch the platform version, and it does NOT touch any other team.

## The one trick: the back-link

Every fork remembers where it came from, using a field called **origin_id**. It points back to the platform row the fork was copied from.

### Why we need it

Let me spell this out, because it's the part that's easy to miss. Say Acme renames their fork from 'Surfactants' to 'Cleaning Agents.' Our platform formulas and index links were attached to the *original* 'Surfactants.' Without a back-link, that rename would quietly break them — the app would lose the thread. With origin_id, the app can always answer one question: 'this team thing is really a copy of that platform thing.' So everything keeps resolving, even after a rename.

## The rule in one line

> Platform data is shared and read-only to teams. A team that wants to change something gets a private **fork** that keeps a **back-link (origin_id)** to the original.

## Where you'll see this

The nice part is it's one pattern, used in three places:

| Thing | Platform version | Team fork |
|---|---|---|
| Formula templates | team_id = NULL | team_id set |
| Product families / subfamilies | team_id = NULL | team_id set + origin_id |
| Products / taxonomy | shipped seed | team copy + origin_id |

Learn it once and it works everywhere.
