# Content crossrefs of task 5.4 (conformance)

The conformance test `src/game/content/contentTypes.test.ts` reads the list below. A recipe input is accepted when a recipe, a job, a zone crop, a trader or the founders' kit produces it, or when it is listed here. A gap missing from this list fails the test, so a new gap cannot hide; delete a line when its source lands (jobs and animals agents). The test does not count terrain `harvestable` as a source because jobs do not read it.

## Source gaps (raw material, gathering source missing)

Format: `- gap: <materialId>` then the recipes that consume it.

- gap: raw_wool (spin_wool_thread)
- gap: raw_hide (tan_hide, scrape_parchment)
- gap: oak_bark (tan_hide)
- gap: honey (brew_mead, make_preserves)
- gap: milk (press_cheese, churn_butter)
- gap: raw_meat (dry_meat, cook_stew, roast_meat)
- gap: salt (dry_meat, salt_fish)
- gap: tallow (dip_candles)
- gap: beeswax (mold_beeswax_candles)
