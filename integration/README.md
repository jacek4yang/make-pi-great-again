# Integration

Cross-repository integration assets. The normative contract text lives in
[CONTRACTS.md](CONTRACTS.md); this directory holds the machine-checkable assets.

- `contracts/` — JSON Schema files mirroring the contract shapes (source of
  truth for fixture validation).
- Fixtures live in `../fixtures/` as producer-output samples (`*.event.json`,
  `*.details.json`) plus negative cases (`*.invalid.json`).

`scripts/check-contracts.mjs` validates every fixture against its schema.
Producer repos must keep their emitted shapes passing against these schemas;
consumer repos use the same fixtures for render/golden tests.
