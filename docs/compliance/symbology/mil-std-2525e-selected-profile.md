# MIL-STD-2525E Change 1 selected symbology profile

## Scope

The first software profile supports server-owned, 20-digit canonical SIDC values and a deliberately
small symbol subset: fixed-wing UAV, rotary-wing UAV, UGV, EO/IR sensor, ground control station,
and waypoint. Affiliation is Friendly, Hostile, Neutral, or Unknown; status is Present or Planned.

The renderer uses both frame geometry and color, keeps the affiliation frame upright, and renders
direction of movement independently. AI detections remain Unknown until an authorized server-side
classification changes affiliation. The browser cannot author affiliation or substitute a display
label for SIDC.

## Qualification boundary

The in-repository SVG renderer contains no third-party symbol artwork or runtime library. This avoids
an unreviewed license dependency but does not make the selected glyphs externally certified.
Conformance remains NOT_RUN until every selected SIDC/entity mapping and modifier is compared with
the controlled MIL-STD-2525E Change 1 reference and golden images receive independent review.

Legacy 15-character SIDC values are rejected by this contract. A future compatibility adapter may
translate them at an explicit boundary without leaking legacy identity into the canonical model.

