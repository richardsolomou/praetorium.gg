# Interface

Praetorium uses a compact, dark interface. [Product design](../product-design.md) describes its scope and overall layout.

## Voice and copy

Player-facing copy is written for somebody building an army or playing Warhammer 40,000. It leads with the game task or outcome and uses words heard at the table: army, list, unit, mission, score, turn, and battle. Implementation terms such as command log, snapshot, catalogue, sync, instance, cache, and server stay in technical documentation rather than product copy.

Useful status copy explains what is happening and what the player can do next. For example, “Army data is still loading. Try again shortly.” is more useful than a description of the source pipeline. Deletion warnings name what will be lost rather than explaining a storage invariant.

Free and open source is prominent in public documentation but secondary to the player benefit in product marketing. Contributor documentation, operator guidance, legal disclosures, data attribution, and actionable support instructions retain the technical detail their audiences need. Sentences are short and direct, without slogans about one record, one log, every device, or a single source of truth.

## Native application layout

Feature screens stay shared between the website and native applications. The native shell replaces the website header with a fixed top bar and section tabs. Phones use bottom tabs. Layouts that are at least 1024 pixels wide use a left rail. Each tab returns to the screen it was left on, and tapping the section you are already in goes to its top.

The top bar keeps the Back action in a fixed location. A detail screen returns to the previous application route. A direct link without application history returns to its mapped parent route. A section root returns to the home page.

Compact roster panes use browser history. A back gesture or Android system Back action dismisses the top pane before it leaves the roster. A datasheet opened from the unit picker returns to that picker. A datasheet opened from a roster unit returns to the roster. In the native applications a compact unit pane is a screen inside the roster tab: it stops above the tab bar and leaves it reachable, where the website treats the same pane as a modal dialog.

## Roster layout

Headings are compact and uppercase, section counts and points use small chips, and player ownership uses consistent red and blue tints. Attacker deployment zones use theme red, defender zones use theme green, and neutral zones use primary green.

The desktop roster builder has picker, roster, and loadout columns. On phones, the roster remains visible while the picker or loadout occupies a sheet. Each picker or loadout pane has one component instance; `src/client/components/builder/Pane.tsx` moves it between desktop and mobile layouts. The server-rendered workspace reserves the desktop picker column so hydration does not shift the roster or loadout.

Squad size is edited on the roster card rather than duplicated in the loadout pane. Unit lists use collapsible primary-category shelves in the same order across rosters, the picker, and faction datasheet pages. Empty shelves are absent, while allied shelves carry their short faction name and begin collapsed.

The loadout editor groups variants by model type, with a separate section for a champion or leader. Model sections use headings and spacing without enclosing borders or backgrounds. Each weapon/loadout option has its own box, including all alternate profiles for that weapon. Model headings align with the box edges, and replacement instructions have equal padding above and below. Default and fixed wargear appear before replacement options, even after being replaced. Nested weapon controls leave their parent loadout and other weapon slots intact. Replacing an optional specialist with an ordinary model also reduces its sibling weapon allocations so saved choices cannot restore the removed specialist. Restoring a specialist fills its required sibling weapon slots without adding optional equipment. Required slots cannot be emptied: removing a replacement returns its default weapon, and the default’s minus button is disabled when the slot must stay filled. Enabled plus buttons use green and minus buttons use muted red, with tinted backgrounds and borders; disabled buttons remain neutral. Each equipment row has one counter; weapons that must be taken together share that counter. Weapon profiles show their stats in columns, with keywords beneath them and equipment abilities visible by default. Keyword tooltips also resolve labels with source target conditions. Source replacement instructions appear beside the matching options, once per model section. Equipped options have a softly tinted green border and a stronger, thicker green left edge. Border widths stay fixed when the option changes so the content does not shift. “No enhancement”, “No upgrade”, and “None” use the same border treatment, without selection ticks or changes to background and text colour. Whole-squad choices use plus/minus actions instead of tick toggles. Alternate weapon profiles sit under one weapon heading with a profile count and an indented list of modes. Loadout dividers have equal spacing above and below. Weapon profiles remain open. Finished rosters show the selected equipment with its details open. Newly selected units wait for their matching settled roster entry before requesting a loadout datasheet. Fixed weapon summaries use counts from the same response as their profiles, so immediate draft edits cannot make sections flash while pricing or datasheets refresh.

A unit card is one target whose main action opens its details. Menu, detach, and join controls handle their own clicks. Tests locate cards and rows through `data-unit`, `data-roster`, and `data-person`; visible-text selectors are unreliable because CSS changes case and labels such as “Unlisted” can appear in more than one control.

A list is named only if its owner typed a name. Everything else reads `rosterLabel`, which folds one from the list itself: the detachments as initials, the size as `1K`, `2K` or `600`, and then the most expensive unit and the Warlord by the word each is known by — `HL 1K - C'tan & Hexmark`. Nothing about it is stored, so it cannot disagree with a detachment that changed, and a name the player typed is never an input to it and never replaced by it. The units are the expensive half, so they arrive with the library's totals; a row still waiting shows the setup alone. A battle snapshot, a sealed league entry and a Games Workshop text export freeze whatever it said at that moment, because those are copies rather than views. A duplicate of an unnamed list stays unnamed.

The roster library uses one Filter button and one Sort button at every width. Roster summaries count an attached character and bodyguard as the one unit they form. `/rosters/$id` is its only roster surface: the owner sees builder controls, while other entitled readers see the same cards and loadout details without mutation controls. Every reading of a roster names its unit count on the identity line, the way the library row does. Unlisted and public roster details offer their canonical link through the native share sheet or clipboard. Read-only rosters retain printing and Games Workshop text export, and the owner has both as well. Signed-in readers can duplicate a roster into a private copy; signed-out readers return through sign-in first.

The owner's View mode is what another reader sees. It withdraws the picker column, the Add units button, the unit-card menus and the loadout controls together, so a list reads the same whoever opened it. What the datasheet says about a unit — its attachments, the units it can lead or be led by — is a fact about the unit rather than an edit, and stays visible in every reading.

A list a battle or a league froze is read through the same screen. It carries the units, the total and the detachments it was fielded with, and the catalogue is only asked for the applied datasheet behind a unit somebody opens, so a frozen list still reads on an instance that cannot price it. Today's catalogue never re-judges it: no legality errors and no unreported-rule notices are drawn over a list that was priced when it was attached. A list with nothing left but its text — pasted, or on a log written before selections were recorded — is the one reading that is not the roster screen.

A shared roster is priced in its route loader, so its server-rendered frame contains the roster cards. If pricing is still pending during a transition, the roster and a selected unit reserve their final panes with loading placeholders; they never claim that a roster is empty or that no unit is selected while waiting for the server.

## Battle setup and tracking

Battle setup has the visible sections Format, Armies, Mission, Battlefield, Defender, Secondaries, Reserves, Deploy, First turn, and Pre-battle rules. The active section comes from the battle log, so every seated screen shows the same point in setup. Every attached roster is visible, while roster selection remains the choice of its owner. Anyone at the table can set reserves and the battle-ready bonus for any army. Deep Strike units precede other Strategic Reserves, and an attached character and bodyguard appear as the one unit they arrive as.

Saved rosters are chosen in a dialog ordered like the roster library. Battlefield selection remains stable while it saves, and each battlefield opens in a full-size dialog without changing the selection.

Battlefield previews and expanded layouts colour physical terrain from each part's source material: dense terrain is green and light terrain is yellow. Unrecognised materials remain neutral. The expanded layout includes the terrain colour key.

Objective markers use the source's objective flags and positions, not terrain component letters. Linked objective pieces share one marker in previews and expanded layouts. Expanded setup distances follow every supplied placement reference, including the additional vertex that fixes an angled piece. Distances come from the drawn geometry and are rounded to hundredths of an inch; missing or unsupported references are not guessed.

The live tracker shows only stratagems valid for the current turn and phase. The CP badge spends the printed cost, the overflow menu handles modified costs, and each stratagem opens the same `detachmentRules` text shown on its detachment page. Missions and stratagems sit together in the side panel because both are read throughout play. Mission references include the card's instructions but omit its lore; grouped payouts are alternatives and ungrouped payouts are additional.

Scoring controls appear only when a card's own data says its phase or turn has ended. `src/client/scoring.ts` determines which cards are due and which draws remain. A scoring prompt follows the card's wording, with one row per condition, its payout, and an option to score nothing. Grouped rows behave as tiers, ungrouped rows can score together, and counted payouts are bounded by the card's ceiling.

Only one live prompt is open at a time. Anything owed by the opponent's turn is settled before the next hand is dealt. Every seated player can complete tactical draws, scoring, discards, prior-turn scoring, and Secret Mission actions for either side. The affected side is named prominently; only a face-down Secret Mission's identity and revealing deck state remain hidden.

Every live action prompt includes Undo latest action. If undo reopens an earlier prompt, that prompt keeps the same control so the table can continue rewinding without first completing the action again.

The tactical draw prompt appears at the start of a player's turn and supports either a random draw or an exact choice from the remaining deck. A manual choice contains every card currently owed, cannot replace an earlier choice once its limit is reached, and requires a known `whenDrawn` return before play continues. The battle-ready bonus is recorded during setup and added to the score only after the battle finishes.

A player's name and picture link to `/users/$userId`. Profiles are public and need no access token. A fielded list links to `/rosters/$id` with the battle token, which gives seated players and revealed-event spectators access to its frozen roster. Catalogue-backed faction marks, faction names, and detachments link to their reference pages.

A fielded army opens over the battle rather than replacing it. Its side panel shows the remaining army using the same roster cards as `/rosters/$id`, rebuilt from battle history rather than the saved list. Each card adds unit position and controls for models, wounds, and losses. Lost units move into a collapsed `Lost` shelf and can be restored. Either seated player can record losses for either army.

Unit counters reflect the unit's actual structure: squads show models, single multi-wound models show wounds, and squads of multi-wound models show both. A datasheet without one consistent wounds characteristic shows models alone. `apply` decides whether a wound also removes a model; the control sends one command and redraws from that result.

Setup and the tracker are arranged by side rather than seat. `src/client/sides.ts` folds `BattleView.players` into the two sides that own command points, victory points, mission cards, and stratagems. A 2v1 ally is a second army within one side panel, not a third column.

`src/core/tableShape.ts` defines the three table shapes and their labels and counts. Manual battle creation, league rules, league chips, and battle buttons all read from it. A 2v1 is named from outside the table and never appears as 1v2. Each surface separately explains what the shape means for seating or roster requirements.

Manual battle creation presents those three shapes. Solo vs pair first asks which role the opener has, then shows only that role's seats and a live side preview. `src/client/seats.ts` defines the seats and `components/Seats.tsx` renders them. The same pair serves manual creation and the league 2v1 chooser, with each caller supplying only the eligible people. A person cannot occupy two seats.

Small, exclusive option sets use `components/Choice.tsx`. Table shapes, 2v1 roles, visibility, joining, and event cadence share this card style. Its `columns` layout is reserved for sets short enough to fit across a phone.

One scoreboard appears at every width and contains both scores, round, phase, and the menu for finishing, conceding, and deleting. Destructive actions remain in that menu behind confirmation. Any seated player can record a concession for any non-automated player, so one device can referee the table. Both sides' controls and tactical decks are available to every seated player without changing who the battle history records as the actor.

Spectators can open the visible mission cards and army details from the read-only battle screen. A face-down Secret Mission remains hidden.

The phase control also has one component instance. CSS moves it between the centre column and a narrow-screen bottom bar, and it always advances the active side. Long card lists open in a dialog that closes after selection.

## Home, search, and leagues

Global search keeps a stable panel height while typing. The query settles before the server request, and prior results remain visible during loading.

Top-level home, account, library, faction, and mission pages have a clear introduction, useful summaries, and next actions. Empty states explain how the first item is added.

The home page uses one content width and one section pattern. Below the top band, each block is a rubric heading over its content and small option sets use the same hairline grid. A signed-in player sees a short welcome band and their own games first; a visitor sees the hero. The shelves run outwards from the reader in a fixed order: `Your games`, `Games you have played`, `Friends' games`, then `Public games`. `Your games` holds the battles that are setting up or live, and `Games you have played` holds the five most recent finished ones above a link to the battles page. A visitor sees `Friends' games` and `Public games` only. Practice games are absent from every home-page shelf and hero.

The visitor hero contains the most recent public battle, whether it is setting up, live, or finished. The logo occupies the same space when no public battle exists, keeping the hero height stable. The featured battle is omitted from the shelf below. The product introduction is always present for visitors and appears for signed-in players only when every game shelf is empty.

Empty shelves explain rather than disappear. A signed-in player with no live game sees how to start one, and one with no friend games sees where friendships are kept — that shelf's text claims nothing about whether they have friends, because a table of friends who all play together has no friend games either. Both are absent when the page is otherwise empty, where the product introduction says more.

`Home` owns data fetching and `HomeView` composes the page from props and fixtures. Every shelf is loaded by the route loader so the server-rendered frame has its final geometry. Friends remains in the signed-in account menu rather than global navigation.

A profile splits into three tabs: the record, the battles, and the rosters the player has published. The tab rides in the address so a tab is a link, and it is not a loader dependency, since every tab's data is fetched for the first frame and switching one is a render rather than a request. A tab nothing would fill is not offered, and an address naming one that is absent falls back to the record. The tab bar carries each section's name and count, so the panel below it does not repeat them.

The leaderboard chooses its faction with a searchable combobox that navigates, so a faction's table has an address somebody can send rather than living in component state, and a busy instance offers dozens of factions as a list to search rather than a wall of chips. Only factions with a finished battle behind them are offered. Every row links to the player it belongs to.

Leagues cover registration, roster reveal, and entrant-started battles. The latest event appears as the current event, while earlier numbered events form the archive. A new event begins without entrants. Before reveal, only roster-submission status is visible, including to the organizer, except that an ally reads the list they will field beside; after reveal, a roster snapshot loads only when its viewer opens. Event pages list live and finished battles as read-only views.

Doubles events use fixed two-player teams. The organizer pairs accepted entrants through search, and starting a battle asks for the opposing team while the server derives the remaining seats. League cards and detail pages share one organizer menu. Right-click opens that menu, deletion requires confirmation, and editing reuses the creation controls.

The entrant list offers View roster to whoever may read that entry, which before reveal is its ally alone, and the sealed-roster panel names the ally who already reads the reader's own list rather than promising that nobody does. The organizer's own controls sit on the same row and recede as they grow rarer: removing an entrant is a muted icon rather than a labelled button, because the confirmation it opens is where the word belongs and an organizer reads the list far more often than they cull it.

The rules pages are a reading surface rather than a control surface. `/rules` lists each document with its sections and filters every rule by name or number, a document's own page lists its rules by the number the source prints against them, and a section page holds those rules with their clarifications collapsed. A number one rule quotes in another is a link, and following one opens the clarification it names. Global search finds a rule the same two ways.

## Components and styles

Muted green represents primary actions, rules references, success, and selection. Amber represents attention, muted steel blue represents navigation and inspectable information, and player-side tints remain separate ownership signals.

`src/client/battleStage.ts` supplies each battle stage's name and tint: amber during setup, primary green during play, and receded grey after completion. Every battle list uses that answer. The spectator screen uses separate words because it describes the reader rather than the battle.

`HoverTooltip` provides rule help from a title, body, and source note. String bodies use the shared Markdown rule renderer, preserving emphasis and lists. The generated Base UI tooltip handles position, focus, collision, and scrolling. Commands remain enabled while saving because `useCommand` serializes a player's taps. `src/client/useSettled.ts` is the single delay for a run of edits before a server request.

The loadout pane is divided by responsibility. `loadoutModel.ts` contains screen-free shapes and decisions, `LoadoutControls.tsx` contains controls, `ModelCard.tsx` renders one model kind, and `Loadout.tsx` assigns choices to model or unit cards.

Route files contain loaders, search parameters, and page shells; stateful interface code lives in `src/client/components`. `src/components/ui` contains generated shadcn Base UI components and changes only through the shadcn CLI. `src/styles.css` maps root tokens to Tailwind utilities through `@theme inline`.

Barlow Semi Condensed provides the display hierarchy and regular Barlow handles paragraph-length rules. Both OFL-licensed fonts are registered in the main stylesheet and preloaded by the root route.

## Verification

Rendered changes are inspected at desktop and phone widths before the relevant Playwright flow runs. Both widths use the same component instances.
