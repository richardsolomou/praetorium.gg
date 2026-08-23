# Stratagems, missions, and scoring

Praetorium reads stratagem and mission data from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. Descriptions come from Wahapedia exports. Every related screen must show the attribution from `src/server/rules.ts`.

## Rules data

- Players choose stratagems, missions, secondaries, and loadouts from fetched data. Do not replace a missing data field with free text.
- Core stratagem timing comes from the rules source; its description comes from Game Datacards at `11th/gdc/core.json`, matched by name. Leave an unmatched card undescribed.
- Faction army rules prefer structured Game Datacards. A pinned Wahapedia faction page fills a faction whose structured sources have no army-rule card; an exact rule name can alias that card to the faction it names.
- An unknown stratagem timing maps to `unlimited`. Do not invent a usage limit.
- Phase and player-turn restrictions are enforced only when the synced source supplies them. Missing timing remains unrestricted.
- A pasted roster has no structured faction or detachment. It cannot provide catalogue-backed stratagems or mission cards.
- `set-prep` stores stratagems and secondaries in one command. Splitting the action would make the second command stale.
- Tactical setup stores the configured deck with the initially drawn cards. Remaining cards are derived from that deck and its history; a replacement cannot name a card outside an authoritative deck.
- King of the Colosseum lasts three rounds and requires tactical secondaries. Its 2.0 battlefield and twists stay unavailable until an upstream source supplies the structured data. Do not substitute another deployment.

## Scoring

- Use each card's award values for scoring controls.
- Track additional command point gains separately from the command-phase grant and score corrections. Each side can gain at most one additional CP per battle round, and spending it does not reopen that allowance.
- At the end of a turn, after scoring, offer to discard any number of active tactical secondaries — including none. It is never mandatory, and the player chooses which cards, if any, to give up. Discarding at least one grants 1 CP when that side has not already used its additional CP gain this round; discarding without that allowance gains nothing. Record the discard and CP together so undo reverses the whole choice.
- Ask for a payout only at the moment its `trigger.timing` names: `end-of-phase` with its phase, `end-of-turn`, or `end-of-battle`. A card the source gave no timing for is never put on a schedule.
- `exclusive_group` defines payout tiers. Selecting one tier clears the other tiers in that group. Ungrouped payouts are independent.
- Read `vp_max` for the ceiling on a counted payout. A ceiling clamps the total; it does not stop the count one short of it.
- A tactical secondary is played once: scoring it finishes it. An unresolved tactical card is only discarded when its owner chooses to at the end of the turn — it is never discarded automatically, and can be kept into the next turn instead. Two more are dealt at the top of every one of a side's own turns regardless of how many earlier cards are still unresolved, so a hand can hold more than two at once; nothing tops it back up to two. A fixed hand is chosen for the whole battle and is not finished by being scored.
- What a payout asks for is the mission pack's `scoringCriteria`, matched to the rules source payout by payout. Never paraphrase a condition id into English: that is a second wording of the same rule, free to drift from the card in the player's hand.
- Match the two sources by payout value, by position when the sequences already agree. A card whose payouts cannot be matched carries no criteria at all rather than the wrong sentence on a row.
- A payout on the opponent's turn is settled as the turn comes back, judged against the round that turn was in and against the hand as it stood when it ended. A card dealt afterwards was not in play for that turn and is never asked about for it.
- That settlement banks its points against the round the ended turn was in, which the second player passing the turn has already moved the battle out of. `score-settlement` carries that round so the fold, the cap and the round breakdown all read it from the command instead of inferring it three times. A command without one means the round being played, which is what every log written before the field existed meant, so a battle already in progress keeps the attribution it was recorded with: its remaining cap checks stay off by whatever a settlement paid across a round boundary. Rewriting a log to correct that would be worse than the error.
- What their turn owed comes before the hand this one deals. Both prompts are modal, so only one is shown at a time.
- Draw tactical cards at random. `when_drawn` defines when a card can return. The battle checks `battle_round` and `card_ids`. The player judges board-state conditions.
- The battle-ready bonus is recorded before the first turn and joins the score only when the battle is finished.
- A mission's stated ceilings are enforced rather than only shown. A score that would carry a category past its round or battle cap is refused, a category the mission states no cap for is never guessed at, and a correction that reduces a total is always allowed through. The refusal lives in `scoringCapError` because the ceilings come from fetched mission data, which `src/core` cannot read.
- A scoring prompt shows what will actually bank once those ceilings have taken their cut, and says what the cap left room for once, beneath the total, rather than under each payout it refuses. The excess is still claimed on the card; it simply does not add up.
- Prompt before passing a turn with an unresolved active card, but leave the final decision to the player because the source cannot infer objective control.
- Derive each side's primary mission from its own force disposition followed by the opposing disposition and the configured mission pack in `PraetoriumService.screen`. Matchup order determines ownership. Settings without a mission pack use the unqualified matchup fallback. A selected mission pack must never fall through to another pack.
- Validate mission, deployment, and terrain references together inside the repository submission transaction before beginning play. Twists remain absent when the source has no structured twist data.

## Deployment patterns

Deployment-zone points are relative to each zone's position. Apply the zone offset before drawing each point. Measure the drawing area from the pattern instead of assuming a board size.
