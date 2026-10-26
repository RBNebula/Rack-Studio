# Power load and equipment weight

Rack Studio records each equipment model's electrical draw and mass, groups a power distributor's outlets into banks with current limits, and warns when a bank or outlet is close to or over its limit. The calculation is in `src/engineering/power.ts` (`analysePower`) and is also exposed as `analyseProject(project).power`.

## Data

All values belong to the **equipment model** (`DeviceDefinition`), so every placed copy of a model shares them.

| Field | Meaning |
| --- | --- |
| `power?: { nominalW, maxW, evidence, source }` | The equipment's own draw in watts. `null` means unknown. Nominal cannot exceed maximum |
| `powerBanks?: [{ id, name, portIds, maxCurrentA, outletMaxCurrentA, voltageV, evidence, source }]` | Outlet groups on a PDU or UPS. Each port belongs to at most one bank. `outletMaxCurrentA` is the per-outlet rating, or `null` when the outlet has none |
| `massKg` | The equipment's mass. `null` means unknown. It uses the model's own evidence and source notes |

Both power fields are optional. Projects saved before they existed load unchanged, and the fields round-trip through JSON import/export, undo/redo and reload.

## Editing

- **Inspector → Power & weight** (select a placed device): nominal and maximum draw, mass, power data status and source notes. The section names the equipment model and how many placed copies share the values. Changing a value without choosing a status marks the record `user-entered`. On a distributor, each bank card shows its load and lets you edit the bank limit, per-outlet limit and voltage.
- **Device Library → Edit → Power & weight**: the same draw and mass fields, plus adding, removing and naming banks and choosing their outlet ports. A new bank starts with an `unknown` 10 A, 230 V placeholder that must be replaced with the rated values.

Every change is one atomic, validated, undoable edit.

## How loads are calculated

- **Feeds** are ordinary cable records. A cable with one end on a port listed in a distributor's bank feeds the device at the other end. Endpoints use stable device and port identities, so moving equipment keeps its feeds.
- **Amps** are `I = W / voltageV`. Watts are treated as volt-amperes (power factor 1). This is conservative for the current estimate only. It is not an apparent-power, harmonic or inrush analysis.
- **Bank utilisation** is maximum-load amps ÷ `maxCurrentA`. Status: `ok` below 80 %, `warning` from 80 % (`POWER_WARNING_UTILISATION`, the common continuous-load derating practice), `over` above 100 %. Each loaded outlet is checked the same way against `outletMaxCurrentA`.
- **Dual supplies**: a device fed from two outlets counts its full draw against each feeding bank and outlet, because in the worst case one supply carries the whole load. It is flagged `redundantFeed` and counted once in project totals and once within any single bank.
- **Chained distributors** (a UPS feeding a PDU): a consumer with its own banks contributes its own draw plus every unique device downstream of it. A device reachable through two chained distributors on the same upstream bank is counted once there. A distribution cycle is reported as an error and its members' loads are incomplete rather than resolved recursively.
- **Unknown values never become zero.** A consumer with a missing draw is listed in the bank's `unknownConsumers`, and the bank's figures are the known part only (`complete: false`). The status is `incomplete` unless the known part already reaches `warning` or `over`. An outlet that feeds an external destination is not resolved as a consumer. It is reported as `external-on-bank` and also makes the bank incomplete, because its draw is unknown.
- **Totals** report the device count, the known mass sum plus the devices missing a mass, and the nominal/maximum own-draw sums of powered devices plus the devices missing a draw. A device counts as powered if it has a power record, power banks, an `IEC-C14`/`IEC-C20` inlet, or a bank feed. A blank plate, for example, is not powered.

## Where warnings appear

- The selected distributor's inspector shows each bank's meter, load, percentage and status (`OK`, `Warning`, `Over limit`, `Incomplete`), unknown consumers, and each loaded outlet's status.
- A fed device's inspector lists its feeds with the feeding bank's status.
- The status bar shows `N power to review` when any power issues exist. Hover over it to read the messages.

There is no power report tab yet. A later power and weights document will use `analysePower`.

## API summary for reports

`analysePower(project): PowerAnalysis` is pure, deterministic, JSON-serialisable and cached per project snapshot. Do not mutate a project after analysing it. Its fields:

- `warningUtilisation`: the 0.8 threshold.
- `distributors[]`: `{ deviceId, name, definitionId, input: { nominal, max }, banks[] }`. Each bank: `{ distributorDeviceId, bankId, name, voltageV, maxCurrentA, outletMaxCurrentA, evidence, source, nominal, max, utilisation, status, consumers[], unknownConsumers[], externalOutlets[], outlets[] }`.
- `devices[]`: one per placed device, with `{ massKg, powered, isDistributor, nominalW, maxW, powerEvidence, powerSource, feeds[], redundantFeed, inCycle, input }`.
- `totals`: `{ deviceCount, mass: { knownKg, complete, missing[] }, power: { poweredDeviceCount, nominal, max, missing[] } }`.
- `issues[]`: `{ severity: 'error' | 'warning' | 'notice', code, message, deviceId, bankId, portId, cableId }`.

Loads are `{ knownW, complete }`. Bank and outlet loads add `knownA`.

## Limits

These are planning checks of entered values, not an electrical design certificate. Inrush current, power factor, phase balance, upstream breaker and cable ratings, UPS runtime, and derating for temperature or grouping are not modelled. Shelf, rail and rack load ratings are not checked against the mass totals.
