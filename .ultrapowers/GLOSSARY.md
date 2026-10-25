# Glossary

## bundle
Everything this repository installs into `~/.claude` as one unit. Contrast `payload`, which is
the source tree the bundle is built from.

## curated
A file a human owns and no tool may rewrite. Marked `CURATED:NOEDIT`, enforced by a hook rather
than by convention.

## delta
A numbered patch in the ultrapowers fork, applied to the renamed upstream tree in filename
order. Each one records a single decision that upstream did not make.

## graft
Behaviour taken from another project's skill and carried into ours as a delta, with attribution.

## manifest
The record of what the last install wrote. It is what makes an install reversible: a file the
bundle never installed never becomes a candidate for removal.

## optional group
A set of bundle components a profile may include or omit as a unit.

## payload
The source tree under `payload/` from which the bundle is assembled. Contrast `bundle`.

## protected
A path listed in a `.protected` file, which may be read and copied from but never edited,
deleted or moved. Enforced by a hook; the rule binds at its directory and every level below.

## tier
A model capability level used when choosing which model runs a role.
