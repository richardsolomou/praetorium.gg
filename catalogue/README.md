# Catalogue release pins

Source pins, composition, provenance, authored corrections and publication live in [praetorium-catalogue](https://github.com/richardsolomou/praetorium-catalogue). Fetched sources, generated JSON and snapshots stay outside this application’s Git history.

`authoring.json` pins the catalogue authoring commit used by checks and builds. `pnpm catalogue:authoring` installs its files into the ignored `.catalogue-authoring/` directory. To test an authoring checkout, set `CATALOGUE_AUTHORING_DIR` to its absolute path; the explicit override does not change the committed pin.

`lock.json` pins a verified source snapshot and, when available, a separately checksummed runtime archive. `pnpm catalogue:snapshot lock <snapshot-id>` adopts a candidate release from either mirror without changing the active development snapshot. Run `just catalogue-preflight` before shipping that pin. Source installation retains original paths and shares identical files on disk. Builds use a compatible prepared runtime; compiler changes that alter its fingerprint trigger local compilation. Keep the runtime format/fingerprint version current when changing projection semantics.

Saved-ID replacements, roster migrations, retained-roster compatibility recipes and coverage acceptance remain here because they govern application behaviour. Catalogue declarations and upstream corrections, including KOTC 2 data, belong in the catalogue repository. Generic capability interpretation remains in the application.

Production packages catalogue data inside its image and warms its complete contexts before accepting traffic. Lookups never download files from GitHub or R2. Publisher activation does not alter an existing image.
