# Catalogue release pins

Source pins, composition, provenance, authored corrections, saved-roster compatibility metadata, coverage exceptions and publication live in [praetorium-catalogue](https://github.com/richardsolomou/praetorium-catalogue). Fetched sources, generated JSON and snapshots stay outside this application’s Git history.

`authoring.json` pins the catalogue authoring commit used by checks and builds. `pnpm catalogue:authoring` installs its files into the ignored `.catalogue-authoring/` directory. To test an authoring checkout, set `CATALOGUE_AUTHORING_DIR` to its absolute path; the explicit override does not change the committed pin.

`lock.json` pins a verified source snapshot and, when available, a separately checksummed runtime archive. `pnpm catalogue:snapshot lock <snapshot-id>` adopts a candidate release from either mirror without changing the active development snapshot or the compatibility authoring pin. Update `authoring.json` deliberately when adopting changed authoring metadata; an older source release must not roll back saved-roster compatibility. Run `just catalogue-preflight` before shipping that pin. Source installation retains original paths and shares identical files on disk. Builds use a compatible prepared runtime; compiler changes that alter its fingerprint trigger local compilation. Keep the runtime format/fingerprint version current when changing projection semantics.

Only authoring and release pins remain here. Saved-ID replacements, roster migration declarations, retained-roster recipes, coverage exceptions, catalogue declarations and upstream corrections belong in the catalogue repository. The application keeps the generic code that interprets them. Builds bundle compatibility metadata from the pinned authoring checkout, so saved-roster lookups need no network access.

Production packages catalogue data inside its image and warms its complete contexts before accepting traffic. Lookups never download files from GitHub or R2. Publisher activation does not alter an existing image.
