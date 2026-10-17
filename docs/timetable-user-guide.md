# How to make your timetable

A one-page guide for deputy principals and timetablers. Everything lives under **Timetable Builder** in the admin menu.

## 1. Set up the school week (once)
**Timetable Builder → School setup**
- **Bell schedule:** tick the school days, then use *Fill in* (first period start, minutes per period, number of periods, "breaks after" e.g. `3,5`). Click between periods to add or remove a break. Double lessons can never run across a break.
- **Subjects:** give each a short name and a colour. Set *Needs room type* (e.g. `lab`) for subjects that must use a special room.
- **Teachers:** short name (shown on class timetables), and optional *Max / day* and *Max / week*. Use *Availability* to grey out times a teacher can't teach.
- **Classes:** use *Availability* for times a class is away (games, assembly).
- **Rooms:** add only the special rooms (labs, computer room, hall). Normal lessons stay in the class's own room.
- **Rules:** choose what the generator should aim for (no subject twice a day, spread subjects, few teacher gaps, respect daily maximum, prefer mornings).

Subjects, classes and teacher accounts themselves come from *Subjects Registry*, *Classes & Streams* and *Staff & Students*.

## 2. Create a timetable and enter lessons
**Timetable Builder → New timetable** (name + term), then the **Lessons** tab:
- **Matrix:** pick a level, choose the subjects, and type periods per week (`d` = doubles) and the teacher for every class. The copy icon on a subject copies the first class's numbers to all streams. Then click *Save matrix*.
- **List → Add lesson:** for combined classes (several classes, one lesson) and **option blocks** (electives that run at the same time for a whole level). All lessons in a block must have the same periods and doubles.
- **Import from Excel:** download the template, fill it in, upload. Nothing is saved if any row has a problem; you'll see which rows to fix.
- Watch **Teacher loads** on the right. A red bar means a teacher has more periods than they're available for.

## 3. Generate
**Generate tab:** the pre-flight check lists anything impossible (each has a *Fix* link). When it's all green, click **Generate timetable**. A typical secondary school finishes within a minute. Lessons it could not place are listed with a plain-English reason and a *Show in editor* link.

Tip: **lock** lessons you want to keep (in the editor), then regenerate with *Keep locked lessons* on.

## 4. Adjust by hand
**Editor tab:** pick a class, teacher or room. Drag a lesson:
- **green** = fits, **amber** = fits but repeats a subject that day, **red** = clash (hover to see why).
- Drop on a red lesson to **swap** if both fit. Drop onto the *Unplaced* panel to remove it from the grid.
- Right-click: Lock/Unlock, Unplace, Change room, Open teacher view. Keys: **L** lock, **Delete** remove, **Ctrl+Z** undo.

The system will never let you create a clash. Every change is checked again on the server.

## 5. Publish and print
**View & publish tab:** check the Class, Teacher, Room and Master views, then click **Publish**. The previous timetable for the same term is archived automatically. Teachers see *My Timetable* and a *Today's lessons* card on their dashboard. Students and parents see their class timetable (subject to the fee rule). Use **Print / PDF** (one timetable per A4 page; master on A3) or **Excel**.

Before big changes, use **Duplicate** on the timetable list to keep a backup.

## 6. When a teacher is absent
**Timetable Builder → Substitutions:** choose the date and the absent teacher(s), then click *Mark absent*. For each affected lesson pick a cover teacher. Suggestions put teachers of the same subject with the lightest day first. *Print cover sheet* gives a daily list. The cover appears on the covering teacher's dashboard.
