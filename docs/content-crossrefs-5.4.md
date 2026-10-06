# Content crossrefs of task 5.4 (conformance)

The conformance test `src/game/content/contentTypes.test.ts` reads the list below. A recipe input is accepted when a recipe, a job, a zone crop, a trader or the founders' kit produces it, or when it is listed here. A gap missing from this list fails the test, so a new gap cannot hide; delete a line when its source lands (jobs and animals agents; the animal products and drops of task 5.3 part 2b landed raw wool, raw hide, milk, raw meat and tallow). The test does not count terrain `harvestable` as a source because jobs do not read it.

## Source gaps (raw material, gathering source missing)

Format: `- gap: <materialId>` then the recipes that consume it.

- gap: oak_bark (tan_hide)
- gap: honey (brew_mead, make_preserves)
- gap: salt (dry_meat, salt_fish)
- gap: beeswax (mold_beeswax_candles)
