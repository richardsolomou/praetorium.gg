# Db

Persist accounts, rosters, battle logs, and league snapshots in Postgres.

## invariants

- stale command stays out of log: A stale battle command leaves the log unchanged until its sender explicitly retries with the current sequence.
  over: a stale roster attachment followed by an explicit retry at the current sequence
  via: requires an explicit retry for a stale roster attachment
  because: automatically replaying a stale command could apply it against battle state the player never saw
  crossing: external-request -> persisted-record
  refuted: removed the expected sequence check -> the stale roster attachment test failed, then passed after restoration (2026-09-25)
  kinds: state
  checklist: revalidated-permission dismissed: this bullet checks sequence freshness, not delayed actor permission
  checklist: separation-of-duties dismissed: no requester and approver roles take part
  checklist: legal-state-succession declared as stale command stays out of log
  checklist: supersession-safety dismissed: the command transaction returns stale instead of publishing later
  checklist: worker-fencing dismissed: no worker lease or ownership generation exists here
  checklist: commit-ordered-effects dismissed: the command has no irreversible external effect
  checklist: resumption-coverage dismissed: the command has no batch checkpoint
