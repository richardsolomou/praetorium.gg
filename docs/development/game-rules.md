# Stratagems, missions, and scoring

Praetorium reads stratagem and mission data from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. Descriptions come from Game Datacards, joined by an exact namespaced reference when the paired snapshot contains it and otherwise by detachment and card name. Related screens display the attribution from `src/server/rules.ts`.

## Rules data

- Players choose stratagems, missions, secondaries, and loadouts from fetched data. A missing data field remains unavailable rather than becoming free text.
- Stratagem timing comes from the rules source; every description comes from Game Datacards (core cards from `11th/gdc/core.json`, faction cards from their faction file). Exact references take priority, every name fallback is reported, and an unmatched or conflicting card remains undescribed.
- Faction army rules come from Game Datacards. A datasheet's faction ability is described by its own faction's card first, then by the one card of that name the files agree on.
- An unknown stratagem timing maps to `unlimited`, so an absent source limit never becomes an invented product limit.
- Phase and player-turn restrictions are enforced only when the synced source supplies them. Missing timing remains unrestricted.
- A pasted roster has no structured faction or detachment. It cannot provide catalogue-backed stratagems or mission cards.
- `set-prep` stores stratagems and secondaries in one command. Splitting the action would make the second command stale.
- Tactical setup stores the configured deck with the initially drawn cards. Remaining cards are derived from that deck and its history; a replacement cannot name a card outside an authoritative deck.
- King of the Colosseum lasts five rounds and requires tactical secondaries. Its 2.0 battlefield and twists stay unavailable until an upstream source supplies the structured data; another deployment is never substituted.

## Scoring

- Scoring controls use each card's award values.
- Both sides gain 1 CP at the start of every command phase. Additional command point gains are tracked separately from that grant and from score corrections. Each side can gain at most one additional CP per battle round, and spending it does not reopen the allowance.
- After end-of-turn scoring, a player may discard any number of active tactical secondaries, including none. Discarding at least one grants 1 CP when that side has not used its additional gain for the round; otherwise it gains nothing. The discard and CP share one command so undo reverses the entire choice.
- A payout appears only at the moment named by `trigger.timing`: its `end-of-phase`, `end-of-turn`, or `end-of-battle`. A card without source timing is absent from the scoring schedule.
- Prepared cards carry server-verified payout timing. The domain cannot pass a known scoring moment until the shared prompt records a score or acknowledgement, and it cannot leave the command phase while a prior turn, tactical draw, or new-hand review remains pending.
- `exclusive_group` defines payout tiers. Selecting one tier clears the other tiers in that group. Ungrouped payouts are independent.
- `vp_max` is the ceiling on a counted payout. It clamps the total rather than stopping the count one short.
- A tactical secondary is played once: scoring it finishes it. An unresolved tactical card is only discarded when its owner chooses to at the end of the turn — it is never discarded automatically, and can be kept into the next turn instead. Two more are dealt at the top of every one of a side's own turns regardless of how many earlier cards are still unresolved, so a hand can hold more than two at once; nothing tops it back up to two. A fixed hand is chosen for the whole battle and is not finished by being scored.
- A payout's wording is the mission pack's `scoringCriteria`, matched to the rules source payout by payout. Condition ids are never paraphrased into a second English version that could drift from the physical card.
- The two sources match by payout value and, when their sequences already agree, by position. A card whose payouts cannot be matched carries no criteria rather than the wrong sentence.
- The action a card names comes from that same pack, joined to the card by name, because the rules source describes no action. Every line is the pack's own sentence, a line it does not state is absent, and a card name two packs disagree about carries no action rather than the wrong one.
- A payout on the opponent's turn is settled as the turn comes back, judged against the round that turn was in and against the hand as it stood when it ended. A card dealt afterwards was not in play for that turn and is never asked about for it.
- That settlement banks its points against the round the ended turn was in, which the second player passing the turn has already moved the battle out of. `score-settlement` carries that round so the fold, the cap and the round breakdown all read it from the command instead of inferring it three times. A command without one means the round being played, which is what every log written before the field existed meant, so a battle already in progress keeps the attribution it was recorded with: its remaining cap checks stay off by whatever a settlement paid across a round boundary. Rewriting a log to correct that would be worse than the error.
- What their turn owed comes before the hand this one deals. Both prompts are modal, so only one is shown at a time.
- Tactical draws can be random or selected from the remaining deck. Manual selection is available at every draw so a player can recreate a physical hand after undoing a mistaken action without swapping a card accidentally. `when_drawn` defines when a card must return. The battle enforces `battle_round` and `card_ids` before the turn can continue. The player judges board-state conditions.
- New Orders spends the stratagem's CP, discards the selected active tactical mission, and draws its random replacement in one command. The replacement returns to the draw review so its own `when_drawn` rule cannot be skipped.
- The battle-ready bonus is recorded before the first turn and joins the score only when the battle is finished.
- A mission's stated ceilings are enforced rather than only shown. A score that would carry a category past its round or battle cap is refused, a category the mission states no cap for is never guessed at, and a correction that reduces a total is always allowed through. The refusal lives in `scoringCapError` because the ceilings come from fetched mission data, which `src/core` cannot read.
- A scoring prompt shows what will actually bank once those ceilings have taken their cut, and says what the cap left room for once, beneath the total, rather than under each payout it refuses. The excess is still claimed on the card; it simply does not add up.
- An unresolved active card produces a prompt before the turn passes, while the player retains the final decision because the source cannot infer objective control.
- `PraetoriumService.screen` derives each side's primary mission from its own force disposition, the opposing disposition, and the configured mission pack. Matchup order determines ownership. Settings without a mission pack use the unqualified fallback, while a selected pack never falls through to another.
- Mission, deployment, and terrain references are validated together inside the repository submission transaction before play begins. Twists remain absent when the source has no structured twist data.

## Deployment patterns

Deployment-zone points are relative to each zone's position. Drawing applies the zone offset to every point and takes its area from the pattern rather than assuming a board size.

## Rules documents

The same source ships the rules themselves beside its cards, in `datacards/11th/gdc/core`. `src/server/rulesCore.ts` reads them and `src/client/ruleMarkup.ts` reads the markup they are written in.

- Whatever files that directory holds and declares as rules documents become documents. Today that is the core rules, Chapter Approved, the event companion, Combat Patrol, and a Legends appendix. The core rules are read first, because the other four amend them.
- A document is sections of numbered rules, and a rule is prose, headings, and collapsible clarifications. `/rules`, `/rules/$documentId`, and `/rules/$documentId/$sectionId` are those three levels. A section is asked for on its own: the five documents together are far more English than a reader has open.
- `ruleIndexOf` derives the contents and every number a page answers to, and travels with each rules page so one rule can link to another. Numbers belong to the document that prints them — Combat Patrol prints an `01.03` of its own — and the core rules answer for a number a document does not print itself. A number nothing prints stays the text the rule prints.
- A rule is addressed by the number printed against it. The second rule to claim a number another has already used is numbered off it, so every rule and clarification on a page has an address of its own.
- The markup reader knows six tags: bold, italic, underline, a keyword, a bullet list, and a table. Only those mean anything, so words in angle brackets stay the words the rule prints, and nothing from the source is handed to the browser as markup. A sub-list written beside the bullet it belongs under, and a sentence left loose in a list the source never closed, are both read rather than dropped.
- The same strings also carry Markdown, which its examples and captions are emphasised in: `***both***`, `**bold**`, `*italic*` and the occasional line of `-` bullets. A span is read where it is written as Markdown writes one — delimiters the same length on both sides, against the words rather than against a space, opening and closing on one line. Everything else stays the character the source printed, because the asterisk it hangs a footnote off would otherwise emphasise the rest of the sentence. Twenty-two markers across the five documents read as markers for exactly that reason.
- A movement behaviour and a core stratagem carry labelled fields beside their prose. Each is labelled from the name the source gives it, so a field this app has never heard of reaches the page instead of disappearing. A field the source states only as a dash is not a rule and is left out.
- The pictures are the printed rulebook's own photography and are not republished. Nothing else the format describes is dropped.
- Every rules page shows the Game Datacards attribution, which its licence requires.
