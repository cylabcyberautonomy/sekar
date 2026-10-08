# sekar

Enforce **coding discipline** for **you** and **your agent**.

sekar is an extension for the [Pi](https://pi.dev) coding agent. You describe a system in prose. sekar writes it down in a diagram, checks the structure with deterministic rules, and asks you questions about the design and code. 

sekar will never propose a fix, only problems. You design; it pokes holes. Code is written only once the design passes determinstic checks.

Inspired by [ponytail](https://github.com/DietrichGebert/ponytail) and [AES-STE1000](https://github.com/danyuchn/asd-ste100-skill).

## Install

Install pi, the sekar extension, [mmdflux](https://github.com/kevinswiber/mmdflux) (our graph renderer), and yaml via Node:

```
./setup.sh
```

Then, start `pi` in any directory and run `/login` once.


## How it works

When you send a message, three steps trigger.

Example:

> I want a security alert pipeline. It takes a packet trace and a list of known bad indicators and outputs alerts. Inside, a flow record builder turns the packet trace into a connection list, and an alert matcher takes the connection list and the indicators and produces the alerts.

... gets turned into...

```
          ╭───────╮
          │ trace │ (D1)
          ╰───────╯
          ┌───┘
          │      ╭──────────────────╮
          │      │ known indicators │ (D3)
          │      ╰──────────────────╯
          │               │
┌────────alert pipeline ──┼──┐
│         ▼               │  │
│ ┌────────────────┐      │  │
│ │ record builder │ (M2) │  │
│ └────────────────┘      │  │
│         │               │  │
│         ▼               │  │
│  ╭────────────╮         │  │ (M1)
│  │ conn. list │ (D4)    │  │
│  ╰────────────╯     ┌───┘  │
│            │        │      │
│            ▼        ▼      │
│           ┌───────────────┐│
│      (M3) │ alert matcher ││
│           └───────────────┘│
│                   │        │
└───────────────────┼────────┘
                    │
                    ▼
                ╭────────╮
                │ alerts │ (D2)
                ╰────────╯
```


1. **Transcribe.** The model turns your messy natural language into nice, structured diagrams of blocks. You and your agent both reason over that block diagram, with the LLM constrained to using a block grammar. If anything's unclear, the agent will stop everything and ask you to clarify.

2. **Check.** Determinstic code in your harness validates that the block structure passes a list of structural rules, including requirements for example data and pseudocode.

3. **Critique.** The model asks three questions, one sentence each, about the design. The user is the only one who can mark a problem as done.



The design lives as a document in `projects/<name>/design.yaml`.

## Example usage

1. **Create or select a project.** Defaults to a project with the same name as your pwd.
```
/project new <name>
/project list
/project select <name>
/project delete <name>
```

2. **Design at a high level.** Work with your agent to create a high level view of your system. The agent records a transcript of each component's discussion in `design.yaml`, and critiques your design.
```
YOU: I want a security alert pipeline. It takes a packet trace and ...
SKR: [C2] Are you addressing any packet format, or just one?
```

3. **Address the critic.** Either answer your critic's comments to improve your design, or resolve the comments once you've heard enough. Your critic will push back against your answers across multiple turns. Comments can be reopened later. 
```
YOU: Regarding C2, I was thinking just NG packets to start with.
SKR: But what about soandso packet format from the 1990s?

/resolve C2 
```
4. **Focus on one module.** At any point, you can select one module to focus on. You can set pseudocode, provide example inputs/outputs, and select the file where the code lives - ONLY while focused. 

```
/focus M3
YOU: Alright, so for each alert entry, the alert matcher does a regex over... 
```

5. **Implement one module.** Enter implementation mode to begin writing code. You can only implement a module once the fields in step 4 have been filled.

```
/implement M3
```

6. **Repeat.**
```
/unfocus
YOU: Well, maybe I want to split up M2 after implementing M3. Make another module that...
... 
YOU: Alright, now I'm ready to flesh out M2.
/focus M2
...
```

## Commands

| Command | What it does |
|---|---|
| `/project new\|select\|list\|delete <name>` | Manage projects |
| `/graph` | Print the graph now; `auto on\|off` prints it after every turn; `theme dark\|light` |
| `/resolve C3` | Close a comment; it reopens if its subject changes |
| `/focus M2`, `/unfocus` | Enter and leave focused design |
| `/implement` | Enter implementation of the focused module, if its requirements are met |

## Graph legend

Data are rounded nodes, modules are boxes, a module with children is a frame. Yellow marks an element with an open comment, red one that blocks: a rule violation, or, after `/implement` was refused, what is still missing. The focused module is drawn with a double border.
