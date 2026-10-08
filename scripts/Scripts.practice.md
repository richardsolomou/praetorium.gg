- accept a catalogue coverage loss: A change that moves what a catalogue card says lands with every intended coverage loss accepted by reason, and only those.
  when: command catalogue:coverage:compare | edit catalogue/accepted-coverage-losses.json
  step: when CI's coverage job reports "no longer lost, so no longer accepted", read git log -1 -- catalogue/accepted-coverage-losses.json before blaming the change; a list filled by an already merged pull request is stale, so empty it to [] in its own commit
  step: pull the "## lost" and "## gained" sections from the coverage job log and pair each lost line with a gained one by the line with its count stripped; a corrected count or a rename reads as one line lost and one gained
  step: decide each unpaired loss: a field dropped by accident is a bug to fix, and only a field withdrawn on purpose is accepted
  step: add each intended loss whole to catalogue/accepted-coverage-losses.json under one reason that names the rule or source behind it
  leaves: an accepted-coverage-losses.json entry with its reason
  step: rerun the coverage job and see it green; budget two CI cycles, because a stale list hides the real diff until it is cleared
  leaves: a green coverage job on the pull request
  pitfall: an accept list filled by one pull request failed the next one, because each accepted line was a loss only against the first one's base (749f2025)
  pitfall: a profile rename from a linked-profile fix read as a lost line and had to be accepted by name (ffef4dbb)
  learned: 800bd063, d2bccfe9, 749f2025, ffef4dbb
  because: the coverage job cannot tell a field dropped by accident from one withdrawn on purpose, so the person making the change has to state the difference, and two failure modes look identical in the log
