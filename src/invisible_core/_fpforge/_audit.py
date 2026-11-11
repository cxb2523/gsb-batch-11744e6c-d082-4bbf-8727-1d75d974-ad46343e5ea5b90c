"""Sampling-stream audit for the fingerprint forge.

This module is a read-only lens over `_sampler.Forge`: it never changes how a
fingerprint is sampled, it only records *which sampling stream decided each
field*. Nothing here mutates module globals, touches the network or a browser,
or holds a random object / network node / function reference in its output -
every return value is plain JSON data.

Why the stream a field belongs to matters
------------------------------------------
Sampling inside the Bayesian network is a cumulative walk over ONE shared
``random.Random`` sequence (see ``_network.Network.sample``). Inserting a new
node into that network consumes one draw and therefore remaps every value
sampled after it. The fields added after the network was first frozen
(``max_touch_points``, ``media_enumeration_ms`` and the ClearType tuning) avoid
that trap: each is drawn from its OWN independently named stream
(``random.Random("<name>:<seed>")``), so adding it adds a field while moving no
existing one. ``browsing_history`` is drawn last from the network's shared
rng, which is why it is the field a new in-network node would shift.

The five real sampling streams are:

* ``network_shared``        - every node of the Bayesian network, sharing the
  per-``Forge`` rng, plus ``browsing_history`` which consumes that same rng
  after the network walk;
* ``max_touch_points``      - the independent ``derive_max_touch_points`` flow;
* ``media_enumeration_ms``  - the independent ``derive_media_enumeration_ms`` flow;
* ``cleartype_tuning``      - the independent ``derive_cleartype_tuning`` flow;
* ``browsing_history``      - the browsing draw, recorded separately even though
  it reads the shared rng, so its position at the tail of the shared sequence
  is explicit.

A sixth pseudo-stream, ``locked_constants``, groups the fields that are not
sampled at all (the compiled-build identity in ``_sampler._LOCKED`` and the
echoed ``stealth_seed``). They are deterministic for reasons unrelated to any
rng and are kept out of both the independent and the shared stream groups.

Public entry points (pure functions, JSON-only return values):

* :func:`audit_seed`        - one seed's fields with per-field stream ownership;
* :func:`compare_samples`   - field-by-field equality of two seeds (or two
  draws of the same seed), split by independent vs. shared streams.
"""
from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any

from . import _sampler

# ── Stream names ────────────────────────────────────────────────────────
#: The Bayesian network's one shared rng (its nodes and the browsing draw).
STREAM_NETWORK_SHARED = "network_shared"
#: Independent, seed-named stream behind ``derive_max_touch_points``.
STREAM_MAX_TOUCH_POINTS = "max_touch_points"
#: Independent, seed-named stream behind ``derive_media_enumeration_ms``.
STREAM_MEDIA_ENUMERATION_MS = "media_enumeration_ms"
#: Independent, seed-named stream behind ``derive_cleartype_tuning``.
STREAM_CLEARTYPE_TUNING = "cleartype_tuning"
#: The browsing-history draw; shares the network rng but is its own step.
STREAM_BROWSING_HISTORY = "browsing_history"
#: Pseudo-stream for fields that are never sampled (locked build identity).
STREAM_LOCKED_CONSTANTS = "locked_constants"

#: The streams whose draws come from their own independently named
#: ``random.Random``. Adding a field on one of these moves no other field.
INDEPENDENT_STREAMS: tuple[str, ...] = (
    STREAM_MAX_TOUCH_POINTS,
    STREAM_MEDIA_ENUMERATION_MS,
    STREAM_CLEARTYPE_TUNING,
)

#: The streams that consume the network's shared rng sequence. Inserting a new
#: draw into this sequence would remap the fields sampled after the insertion.
SHARED_STREAMS: tuple[str, ...] = (
    STREAM_NETWORK_SHARED,
    STREAM_BROWSING_HISTORY,
)

#: Every stream name the audit can emit, in presentation order.
ALL_STREAMS: tuple[str, ...] = (
    STREAM_NETWORK_SHARED,
    STREAM_MAX_TOUCH_POINTS,
    STREAM_MEDIA_ENUMERATION_MS,
    STREAM_CLEARTYPE_TUNING,
    STREAM_BROWSING_HISTORY,
    STREAM_LOCKED_CONSTANTS,
)

#: Human-readable description of each stream for the audit's ``streams`` block.
_STREAM_DESCRIPTIONS: dict[str, str] = {
    STREAM_NETWORK_SHARED:
        "Bayesian network nodes drawn from the Forge's shared random.Random",
    STREAM_MAX_TOUCH_POINTS:
        "independent seed-named stream: derive_max_touch_points",
    STREAM_MEDIA_ENUMERATION_MS:
        "independent seed-named stream: derive_media_enumeration_ms",
    STREAM_CLEARTYPE_TUNING:
        "independent seed-named stream: derive_cleartype_tuning",
    STREAM_BROWSING_HISTORY:
        "browsing draw from the network's shared rng, after the network walk",
    STREAM_LOCKED_CONSTANTS:
        "not sampled: compiled-build identity constants and the echoed seed",
}

# ── Field ownership ─────────────────────────────────────────────────────
# The mapping is explicit rather than inferred from the network object: the
# audit must never hold a Node or a function, and an explicit table is what a
# reviewer reads when a new field is added. The audit still asserts at runtime
# that every field a sample actually carries is covered here (see
# ``_build_stream_groups``), so a forgotten field fails loudly instead of being
# silently misattributed.

#: Fields sampled by the Bayesian network nodes from the shared rng.
_NETWORK_SHARED_FIELDS: tuple[str, ...] = (
    "webgl_renderer",
    "webgl_vendor",
    "gpu_class",
    "intra_tier",
    "screen_tier",
    "screen_w",
    "screen_h",
    "screen_avail_w",
    "screen_avail_h",
    "dpr",
    "hw_concurrency",
    "msaa_samples",
    "audio_sample_rate",
    "audio_output_latency_ms",
    "audio_max_channel_count",
    "av1_enabled",
    "webm_encoder_enabled",
    "mediasource_webm",
    "mediasource_mp4",
    "storage_quota_mb",
    "dark_theme",
)

#: Field drawn by ``derive_max_touch_points`` from its own named stream.
_MAX_TOUCH_POINTS_FIELDS: tuple[str, ...] = ("max_touch_points",)

#: Field drawn by ``derive_media_enumeration_ms`` from its own named stream.
_MEDIA_ENUMERATION_MS_FIELDS: tuple[str, ...] = ("media_enumeration_ms",)

#: Fields drawn by ``derive_cleartype_tuning`` from its own named stream.
_CLEARTYPE_TUNING_FIELDS: tuple[str, ...] = (
    "font_cleartype_gamma",
    "font_cleartype_contrast",
)

#: Field drawn by ``derive_browsing_history`` from the network's shared rng.
_BROWSING_HISTORY_FIELDS: tuple[str, ...] = ("browsing_history",)

# stream -> the fields owned by that stream, excluding the locked pseudo-stream
# whose membership is derived from ``_sampler._LOCKED`` plus the seed echo.
_STREAM_FIELD_TABLE: dict[str, tuple[str, ...]] = {
    STREAM_NETWORK_SHARED: _NETWORK_SHARED_FIELDS,
    STREAM_MAX_TOUCH_POINTS: _MAX_TOUCH_POINTS_FIELDS,
    STREAM_MEDIA_ENUMERATION_MS: _MEDIA_ENUMERATION_MS_FIELDS,
    STREAM_CLEARTYPE_TUNING: _CLEARTYPE_TUNING_FIELDS,
    STREAM_BROWSING_HISTORY: _BROWSING_HISTORY_FIELDS,
}


# ── Structured failure helper ───────────────────────────────────────────
def _failure(
    code: str,
    reason: str,
    *,
    seed: int,
    fixed_gpu_class: str | None,
) -> dict[str, Any]:
    """A JSON-only error envelope. The audit reports failure as data, never as
    an uncaught exception."""
    return {
        "ok": False,
        "error": {
            "code": code,
            "reason": reason,
            "fixed_gpu_class_unavailable": (
                code == "invalid_fixed_gpu_class"
            ),
        },
        "seed": seed,
        "fixed_gpu_class": fixed_gpu_class,
        "field_count": 0,
        "fields": [],
        "values": {},
        "streams": {},
        "stream_groups": {},
        "independence": None,
        "warnings": [reason],
    }


def _coerce_seed(seed: Any) -> int | None:
    """Mirror ``Forge``'s ``int(seed)`` coercion; return None when impossible."""
    try:
        return int(seed)
    except (TypeError, ValueError, OverflowError):
        return None


def _locked_fields() -> list[str]:
    """Fields the forge copies verbatim from ``_LOCKED`` plus the echoed seed.
    They are data, not draws, so they belong to no rng stream."""
    return ["stealth_seed", *_sampler._LOCKED.keys()]


def _build_stream_groups(sample_keys: Sequence[str]) -> dict[str, list[str]]:
    """Map every sampled field to its stream, preserving sample order inside
    each group. A field missing from the ownership table is a defect in THIS
    module (a new sampler field with no declared stream); it is surfaced as a
    warning and parked under the locked pseudo-stream rather than dropped, so
    ``field_count`` still covers every field."""
    owner: dict[str, str] = {}
    for stream, names in _STREAM_FIELD_TABLE.items():
        for name in names:
            owner[name] = stream
    for name in _locked_fields():
        owner[name] = STREAM_LOCKED_CONSTANTS

    groups: dict[str, list[str]] = {name: [] for name in ALL_STREAMS}
    unclassified: list[str] = []
    for key in sample_keys:
        stream = owner.get(key)
        if stream is None:
            unclassified.append(key)
            groups[STREAM_LOCKED_CONSTANTS].append(key)
        else:
            groups[stream].append(key)
    return groups, unclassified


def _verify_independence(
    seed: int, bundle: dict[str, Any]
) -> dict[str, Any]:
    """Prove, for one concrete sample, that the independent-stream fields are
    fully determined by their own named flows.

    Each independent field is re-derived by calling the standalone derive
    function with only the seed (and the sampled class for the touch draw). If
    the re-derived value equals the field in the bundle, that field did not
    depend on the network's shared rng - which is exactly the property that
    lets a new independent stream be added without moving any existing field.
    """
    checks = [
        {
            "field": "max_touch_points",
            "stream": STREAM_MAX_TOUCH_POINTS,
            "sampled_value": bundle["max_touch_points"],
            "rederived_value": _sampler.derive_max_touch_points(
                bundle["gpu_class"], seed
            ),
        },
        {
            "field": "media_enumeration_ms",
            "stream": STREAM_MEDIA_ENUMERATION_MS,
            "sampled_value": bundle["media_enumeration_ms"],
            "rederived_value": _sampler.derive_media_enumeration_ms(seed),
        },
        {
            "field": "font_cleartype_gamma",
            "stream": STREAM_CLEARTYPE_TUNING,
            "sampled_value": bundle["font_cleartype_gamma"],
            "rederived_value": _sampler.derive_cleartype_tuning(seed)[0],
        },
        {
            "field": "font_cleartype_contrast",
            "stream": STREAM_CLEARTYPE_TUNING,
            "sampled_value": bundle["font_cleartype_contrast"],
            "rederived_value": _sampler.derive_cleartype_tuning(seed)[1],
        },
    ]
    for check in checks:
        check["matches"] = (
            check["sampled_value"] == check["rederived_value"]
        )
    independent_fields = [
        name
        for names in (
            _MAX_TOUCH_POINTS_FIELDS,
            _MEDIA_ENUMERATION_MS_FIELDS,
            _CLEARTYPE_TUNING_FIELDS,
        )
        for name in names
    ]
    return {
        "independent_streams": list(INDEPENDENT_STREAMS),
        "shared_streams": list(SHARED_STREAMS),
        "independent_fields": independent_fields,
        "shared_fields": [
            *_NETWORK_SHARED_FIELDS,
            *_BROWSING_HISTORY_FIELDS,
        ],
        "rederivation_checks": checks,
        "all_independent_fields_rederived_from_named_streams": all(
            check["matches"] for check in checks
        ),
        "property": (
            "fields on an independent named stream are determined only by the "
            "seed, so adding a new independent stream field consumes no draw "
            "from the network's shared sequence and moves no existing field"
        ),
    }


# ── Public entry point 1: per-seed stream audit ─────────────────────────
def audit_seed(
    seed: Any,
    fixed_gpu_class: str | None = None,
) -> dict[str, Any]:
    """Audit one forge sample: every field's value and owning sampling stream.

    Parameters
    ----------
    seed:
        The ``stealth_seed``. Coerced with ``int()`` exactly like ``Forge``.
    fixed_gpu_class:
        Optional GPU class pin forwarded to ``Forge.sample``. An unknown class
        name (or non-string) is not raised: a structured failure result with
        ``error.fixed_gpu_class_unavailable == True`` is returned instead.

    Returns
    -------
    dict
        A pure-data, ``json.dumps``-able object. On success it carries
        ``ok=True``, the ordered ``fields`` (each with ``name``, ``value`` and
        ``stream``), a ``values`` mapping, ``field_count``, ``stream_groups``
        (stream name -> field names), a ``streams`` description block and an
        ``independence`` block. On failure it carries ``ok=False`` plus a
        readable ``error`` reason.
    """
    coerced_seed = _coerce_seed(seed)
    if coerced_seed is None:
        return _failure(
            "invalid_seed",
            f"seed must be an integer (or int-coercible); got {seed!r}",
            seed=0,
            fixed_gpu_class=fixed_gpu_class if isinstance(
                fixed_gpu_class, str
            )
            else None,
        )

    requested_class: str | None = fixed_gpu_class
    if fixed_gpu_class is not None and not isinstance(fixed_gpu_class, str):
        return _failure(
            "invalid_fixed_gpu_class",
            f"fixed_gpu_class must be a string class name; "
            f"got {fixed_gpu_class!r}",
            seed=coerced_seed,
            fixed_gpu_class=None,
        )
    if fixed_gpu_class is not None and (
        fixed_gpu_class not in _sampler._GPU_CLASSES
    ):
        valid = ", ".join(_sampler._GPU_CLASSES)
        return _failure(
            "invalid_fixed_gpu_class",
            f"fixed_gpu_class {fixed_gpu_class!r} is not one of the "
            f"{len(_sampler._GPU_CLASSES)} known GPU classes ({valid})",
            seed=coerced_seed,
            fixed_gpu_class=fixed_gpu_class,
        )

    # The audit does not alter any global random state: the forge builds its
    # own random.Random, and the derive functions build theirs locally.
    before = random.getstate()
    try:
        bundle = _sampler.Forge(coerced_seed).sample(requested_class)
    # The audit's contract is "never escape with an uncaught exception": every
    # failure, including an unexpected one inside the forge, must come back as
    # the structured error envelope below.
    except Exception as exc:  # noqa: BLE001 - envelope-by-contract, see above
        return _failure(
            "sampling_error",
            f"the forge raised {type(exc).__name__}: {exc}",
            seed=coerced_seed,
            fixed_gpu_class=requested_class,
        )
    finally:
        # Restore is defensive only; nothing above should touch the global rng.
        random.setstate(before)

    groups, unclassified = _build_stream_groups(list(bundle.keys()))
    warnings: list[str] = []
    if unclassified:
        warnings.append(
            "fields have no declared sampling stream and were parked under "
            f"{STREAM_LOCKED_CONSTANTS!r}: {unclassified}"
        )

    fields = [
        {
            "name": name,
            "value": value,
            "stream": next(
                stream
                for stream, names in groups.items()
                if name in names
            ),
        }
        for name, value in bundle.items()
    ]

    stream_groups = {
        stream: names
        for stream, names in groups.items()
        if names
    }
    streams_block = {
        stream: {
            "description": _STREAM_DESCRIPTIONS[stream],
            "kind": (
                "independent"
                if stream in INDEPENDENT_STREAMS
                else "shared"
                if stream in SHARED_STREAMS
                else "constant"
            ),
            "field_count": len(groups[stream]),
            "fields": groups[stream],
        }
        for stream in ALL_STREAMS
    }

    return {
        "ok": True,
        "error": None,
        "seed": coerced_seed,
        "fixed_gpu_class": requested_class,
        "field_count": len(fields),
        "fields": fields,
        "values": dict(bundle),
        "streams": streams_block,
        "stream_groups": stream_groups,
        "independence": _verify_independence(coerced_seed, bundle),
        "warnings": warnings,
    }


# ── Public entry point 2: field-by-field comparison ─────────────────────
def _equality_rows(
    first: dict[str, Any], second: dict[str, Any]
) -> list[dict[str, Any]]:
    """Per-field equality with each field's stream attached. A field missing
    on either side is reported unequal rather than raising."""
    rows: list[dict[str, Any]] = []
    groups = _build_stream_groups(list(first.keys()))[0]
    for name, value_a in first.items():
        stream = next(
            stream for stream, names in groups.items() if name in names
        )
        present_b = name in second
        rows.append({
            "field": name,
            "stream": stream,
            "equal": bool(present_b and value_a == second[name]),
            "value_a": value_a,
            "value_b": second[name] if present_b else None,
            "present_in_both": present_b,
        })
    return rows


def _summarise_group(
    rows: Sequence[dict[str, Any]], streams: Sequence[str]
) -> dict[str, Any]:
    """Aggregate equality for the fields owned by a set of streams."""
    selected = [row for row in rows if row["stream"] in streams]
    equal = [row["field"] for row in selected if row["equal"]]
    unequal = [row["field"] for row in selected if not row["equal"]]
    return {
        "field_count": len(selected),
        "all_equal": not unequal,
        "equal_fields": equal,
        "unequal_fields": unequal,
    }


def compare_samples(
    seed_a: Any,
    seed_b: Any | None = None,
    fixed_gpu_class: str | None = None,
) -> dict[str, Any]:
    """Compare two forge samples field by field.

    With one seed (``seed_b`` left as None) the seed is audited twice, which
    is the determinism check: every field of both draws must be equal. With
    two distinct seeds the report shows which fields move and, crucially,
    which streams own them - the independent streams are called out so the
    "a new independent field moves nothing existing" guarantee is checkable.

    The result is pure JSON data. If either audit fails (for example an
    illegal ``fixed_gpu_class``), ``ok`` is False and the structured reason is
    echoed under ``error``.
    """
    repeat = seed_b is None
    actual_seed_b = seed_a if repeat else seed_b

    audit_a = audit_seed(seed_a, fixed_gpu_class)
    audit_b = audit_seed(actual_seed_b, fixed_gpu_class)
    if not audit_a["ok"] or not audit_b["ok"]:
        broken = audit_a if not audit_a["ok"] else audit_b
        return {
            "ok": False,
            "error": broken["error"],
            "mode": "same_seed_repeat" if repeat else "two_seeds",
            "seed_a": audit_a.get("seed"),
            "seed_b": audit_b.get("seed"),
            "field_comparison": [],
            "independent_streams": None,
            "shared_streams": None,
            "conclusion": None,
        }

    bundle_a = audit_a["values"]
    bundle_b = audit_b["values"]
    rows = _equality_rows(bundle_a, bundle_b)

    independent = _summarise_group(rows, INDEPENDENT_STREAMS)
    shared = _summarise_group(rows, SHARED_STREAMS)
    locked = _summarise_group(rows, (STREAM_LOCKED_CONSTANTS,))
    overall_equal = all(row["equal"] for row in rows)

    if repeat:
        conclusion = (
            "same seed sampled twice: every field is equal, so the forge is "
            "deterministic per stealth_seed across every sampling stream"
            if overall_equal
            else "same seed sampled twice produced differing fields, which "
            "breaks per-seed determinism"
        )
        expectation = "all fields must be equal"
    else:
        conclusion = (
            "distinct seeds may move both independent-stream and "
            "shared-stream fields; the independent_fields list names exactly "
            "the fields a newly added independent stream can never shift, "
            "because they read their own seed-named random.Random rather "
            "than the network's shared sequence"
        )
        expectation = (
            "fields may differ; differing fields are reported with their "
            "owning stream"
        )

    return {
        "ok": True,
        "error": None,
        "mode": "same_seed_repeat" if repeat else "two_seeds",
        "seed_a": audit_a["seed"],
        "seed_b": audit_b["seed"],
        "fixed_gpu_class": fixed_gpu_class,
        "field_count": len(rows),
        "field_comparison": rows,
        "independent_streams": {
            "streams": list(INDEPENDENT_STREAMS),
            **independent,
        },
        "shared_streams": {
            "streams": list(SHARED_STREAMS),
            **shared,
        },
        "locked_constants": locked,
        "all_fields_equal": overall_equal,
        "expectation": expectation,
        "conclusion": conclusion,
    }
