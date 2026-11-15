# Protocols App – Spec (v0.1)

Nov 14, 2026. Structure only, no code yet. Source protocols: Huberman, *Protocols* (2024), via the user's Implementation List (Nov 11, 2026).

## 1. Concept

A personal protocol manager with a game layer. Protocols from the book are placed in a 3-layer pyramid, done daily or weekly, and each protocol levels up with use.

- Platform: PWA hosted on GitHub Pages. Works offline, installable on the phone.
- Data: stored on the device only (IndexedDB). No accounts, no sharing.
- Backup: Export / Import JSON (with a schema version).
- Content: codes, short own-words abstracts, page numbers. No book text.

## 2. Layers and effort

| Layer | Meaning | Effort limit |
| --- | --- | --- |
| Base | Every day, essential | 5 |
| Layer 2 | A few times a week | 5 (starting value, change later) |
| Test | 1 or 2 protocols tried for 2 to 4 weeks, one daily metric | 2 |

- Every protocol has an effort. The start values are in the library file. Fractions are allowed (0,5).
- A move into a layer is blocked if it would pass the limit. The message shows the shortfall and offers a swap.
- Lowering a limit below current use is allowed. The layer shows red until fixed.
- Level and XP stay with the protocol when it moves. Demoting needs no reason note.
- **As-needed** protocols (e.g. physiological sighs, nap, jet lag tips) have no layer and no effort cost.
- **Doctor** protocols (supplements, prescription drugs) are flagged, outside the pyramid, no XP.

### Layer 2 weekly target

$$T_{week} = \lceil 0{,}5 \cdot f_{rec} \rceil$$

Excel: `=ROUNDUP(0,5*C2;0)`. Example: $f_{rec}=7$ gives $T=\lceil 3{,}5 \rceil = 4$. A protocol can have a **target override** (EP2, EP3 are fixed at 3 on set weekdays).

## 3. XP and levels

XP per completion:

$$XP_{gain} = 10 \cdot \text{effort}$$

Cost to go from level $L$ to $L+1$:

$$C(L) = 100 \cdot L$$

Total XP to reach level $L$ (arithmetic series):

$$XP_{total}(L) = \sum_{k=1}^{L-1} 100k = 50\,L\,(L-1)$$

Level from total XP (solve the quadratic, round down):

$$L = \left\lfloor \frac{1+\sqrt{1+\dfrac{XP}{12{,}5}}}{2} \right\rfloor$$

Excel: `=INT((1+SQRT(1+B2/12,5))/2)`. Check: 100 XP gives level 2, 300 XP gives level 3.

Other rules:
- One XP gain per protocol per day.
- No XP loss and no streak counters. Consistency is the % of the last 30 days (pause days excluded).
- Layer 2 weekly target met: +20 XP.
- Test finished with a verdict: +50 XP, even if the protocol is dropped.
- As-needed use: flat +5 XP per tap, several per day allowed.
- One overall player level, calculated from the combined XP with the same formula.
- XP is stored in each completion. Changing an effort later does not change old XP.
- Not decided: what a level does besides display (idea: a high level lowers effort, needs fractional effort).

## 4. Screens

### Today
- Grouped by layer, each row with a small time-of-day tag, level badge and effort.
- Tap = done, XP once per day, row dims and sinks. Tap again = undo.
- Base: all shown. Layer 2: "done this week / target · days left", highlighted when days left equals completions left. Fixed-weekday protocols show only on their days.
- Test card: day count and the daily metric input. Logging the metric counts as the completion. "Start a test" card when a slot is free.
- As-needed: quick buttons.
- Top bar: Base progress and XP today. No streak counter.
- Menu: pause day. Backfill: last 3 days, normal XP.

### Pyramid
- Three layers with capacity bars (used / limit), protocols inside each.
- Test queue (order you choose), backlog (unplaced), doctor section.
- Protocol card: abstract, codes, page, level and XP bar, frequency, effort, layer, "Move to…".
- Edit mode for effort and limits.

### Test sheet
- Start form: protocol, duration 14 to 28 days, metric (name, type: 1–5, number with unit, yes/no), optional baseline, one-line hypothesis.
- During: metric line chart with baseline, gaps for missed days, optional day notes, early stop allowed.
- End: **forced verdict** screen with average vs baseline and **completion %** (no minimum-days rule), then choose: keep in Layer 2, promote to Base, or drop to backlog (capacity check and swap apply). Optional "what I learned". +50 XP.
- History of finished tests. Re-testing a dropped protocol is allowed, earlier results visible.

### Library
- One row per unique protocol with all codes. Filters: category, layer, backlog, doctor. Search by code, name, abstract.
- Protocol card with calendar heat map and actions: move, edit, pause, archive.
- Custom protocols allowed (codes like CU1). Protocols are **archived, never deleted**.
- One-time import from the library file.

### Review
- Opens on the week, 30 days one tap away.
- Summary: Base completion %, Layer 2 targets met, active test, XP for the period, overall level.
- Per protocol: 30-day %, level, quiet marker when low. Heat maps, level list, test history link.
- Backup buttons (export / import).
- Optional Sunday check-in prompt, off by default.

## 5. Data model

**Protocol**: id, codes (main + same-as), pages, name, category, abstract, type (scheduled / as_needed), layer (base, l2, test, backlog, doctor, as_needed, archived), suggested layer, effort, recommended frequency per week, target override, fixed weekdays, time of day, goes-with links, doctor flag, custom flag, queue order, note.

**Completion**: protocol id, date, XP awarded, kind (normal / backfill / as_needed), metric value, note.

**Test**: protocol id, start date, planned days, metric (name, type, unit), baseline, hypothesis, status, end date, verdict, learned note.

**Pause day**: date.

**Settings**: layer limits, XP per effort, level cost, bonuses, check-in on/off, schema version.

**Calculated, not stored**: protocol XP and level, overall level, Layer 2 weekly target and progress, completion %, capacity used per layer.

## 6. Build order

1. Data model + library import file
2. Library
3. Pyramid with limits and move rules
4. Today + XP and levels
5. Layer 2 weekly targets and pause days
6. Test sheet and forced verdict
7. Review + backup
8. PWA polish (icon, offline, install, GitHub Pages)

## 7. Open items

- Efforts, recommended frequencies and the Layer 2 limit of 5 are starting guesses. Change them in the library.
- Abstracts are drafts from the titles and general knowledge. Check them against the book. Page numbers are from the contents photos, check any that look wrong.
- SP14 is merged into SP3 (evening light and screens, one habit with codes SP3 / LP3 / SP14).
- The four Test candidates (SP11, SC2, SC5, LRP5) start in the queue, no test is running.
- SC1, SP7 and SP15 are treated as as-needed. SP7 was Layer 2 in the list.
- EP2 and EP3 need their fixed weekdays set.
- What a level does beyond display.


## Appendix: protocol library (review table)

Same data as `protocols-library.json`. Layer is the starting layer. Frequency is per week (guess unless the title gives it).

| Codes | Name | Layer | Effort | Freq | Abstract (draft) |
| --- | --- | --- | --- | --- | --- |
| SP1 / LP1 | Morning light | base | 1 | 7 | Get bright light into your eyes soon after waking, outdoors if you can. It sets your body clock and helps you wake up. |
| SP2 / LP2 | Late afternoon light | l2 | 0,5 | 7 | Get some outdoor light in the late afternoon or early evening. It helps your body clock cope with artificial light at night. |
| SP3 / LP3 / SP14 | Evening light and screens | base | 0,5 | 7 | Keep lights low and avoid screens in the last hour before bed, so bright light does not delay your sleep. |
| SP4 | Fixed sleep and wake times | base | 1 | 7 | Find the sleep and wake times that suit you and keep them as steady as you can. |
| SP5 | Cool down at night | backlog | 1 |  | Help your body cool down in the evening and at night, so falling asleep and staying asleep is easier. |
| SP6 | Warm up before waking | backlog | 1 |  | Let your body warm up gently in the last hours of sleep, to make waking up easier. |
| SP7 | Nap | as_needed | 0 |  | A short nap of the right length to make up a small sleep shortfall. |
| SP8 / SC3 | NSDR (deep rest) | l2 | 0,5 | 7 | A guided deep-rest session done awake. Use it to recover from poor sleep, calm stress, and to fall and stay asleep. |
| SP9 | Sleep supplements | doctor | 0 |  | Supplements that may support sleep. Talk to a doctor before trying. |
| SP10 | Prescription sleep drugs | doctor | 0 |  | Be careful with prescription sleep drugs. Talk to a doctor. |
| SP11 | Caffeine schedule | backlog | 1 |  | Change when you drink caffeine, for example stop earlier in the day, and see if your sleep improves. |
| SP12 | No alcohol before sleep | backlog | 1 |  | Do not drink alcohol in the hours before bed, because it hurts sleep quality. |
| SP13 | No cannabis as sleep aid | backlog | 1 |  | Do not use cannabis to help you sleep. |
| SP15 | Jet lag tips | as_needed | 0 |  | A tip sheet for adjusting to a new time zone when you travel. |
| EP1 | Walk daily | base | 1 | 7 | Walk as much as you can through the day. |
| EP2 | Resistance training | l2 | 1 | 3 | Strength training three times per week. |
| EP3 | Cardio training | l2 | 1 | 3 | Cardiovascular training three times per week. |
| EP4 | Mobility and flexibility | l2 | 0,5 | 3 | Short mobility and flexibility sessions, two to four times per week. |
| SC1 | Physiological sighs | as_needed | 0 |  | One to three deliberate breathing sighs for fast stress relief. |
| SC2 | Deliberate cold exposure | backlog | 1 |  | Use cold exposure on purpose to raise your stress threshold. |
| SC4 | Micro meditation after waking | backlog | 1 |  | A very short meditation right after waking up. |
| SC5 | Morning stress-hormone peak | backlog | 1 |  | Ways to boost the natural morning peak of cortisol and adrenaline-type hormones, for energy and alertness. |
| SC6 | Stress supplements | doctor | 0 |  | Supplements that may help with excessive stress. Talk to a doctor first. |
| NP1 | Unprocessed food | base | 1 | 7 | At least 90 percent of what you eat should be unprocessed or minimally processed. |
| NP2 | Hydration | base | 0,5 | 7 | Stay hydrated through the day. |
| NP3 | High CP:C protein | backlog | 1 |  | Choose protein with a high CP:C ratio (as defined in the book) at each full meal. |
| NP4 | Veg and fruit carbs | backlog | 1 |  | Get most of your carbohydrates from fibrous vegetables and some fruit. |
| NP5 | Healthy fats | backlog | 1 |  | Include healthy fats in most meals and snacks. |
| NP6 | Fermented foods | l2 | 0,5 | 7 | Eat low-sugar fermented foods. |
| NP7 | Fatty fish / omega-3 | l2 | 0,5 | 3 | Eat fatty ocean fish, and/or consider omega-3 supplements. |
| LP4 | Skin sunlight | backlog | 1 |  | Get sunlight on your upper and lower body skin during the day. |
| LP5 | Long-wavelength light | backlog | 1 |  | Expose skin and eyes to long-wavelength light (red, near-infrared, infrared). |
| LRP1 | Alertness and focus | backlog | 1 |  | Ways to shift into a state of alertness and focus. |
| LRP2 | Mental contrasting | backlog | 1 |  | Picture your goal and the obstacles together, to build urgency and reach the goal. |
| LRP3 | Embrace errors | backlog | 1 |  | Treat mistakes as useful signals to improve your performance. |
| LRP4 | Sleep after learning | backlog | 1 |  | Prioritize good sleep the night after you learn something new. |
| LRP5 | Micro rests in learning | backlog | 1 |  | Take short micro rests inside your learning sessions. |
| LRP6 | Mental rehearsal | backlog | 1 |  | Rehearse a skill in your mind to help you remember it. |
| PG1 | Present awareness | backlog | 1 |  | Replace mind wandering with awareness tied to the present moment. |
| PG2 | Hollis guide to your best life | backlog | 1 |  | Use James Hollis's approach to build your best life. |
| PG3 | Expressive writing | backlog | 1 |  | Write about inner pain points to work through them. |
| PG4 | Reframe loss | backlog | 1 |  | Reframe a loss to help you move through grief. |
