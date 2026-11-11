/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2016-2023 - https://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Envelope scheduling audit
 *
 * A pure, side-effect free module that mirrors the pitch envelope scheduling
 * logic of adsr-module.ts (applyPitchEnvelope / applyPitchRelease). Given the
 * same inputs it describes - as structured data - exactly which Web Audio
 * AudioParam methods would be invoked, with which arguments, and what the
 * intermediate target values are. This allows pages and unit tests to inspect
 * envelope behaviour without requiring an AudioContext or audio hardware.
 *
 * NOTE: the formulas here intentionally duplicate those in adsr-module.ts.
 * When changing one, change the other to keep the audit truthful.
 */

// max value we expect for the pitch envelope's range (mirrors adsr-module.ts)
export const MAX_PITCH_ENVELOPE_VALUE = 24;

// cents per octave, used to calculate the pitch step for oscillator type generators
export const CENTS_PER_OCTAVE = 1200;

export type EnvelopeStepMethod = "cancelScheduledValues" | "setValueAtTime" | "linearRampToValueAtTime";

/**
 * A single scheduled AudioParam invocation, in the order it would be executed.
 */
export type EnvelopeScheduleStep = {
    method: EnvelopeStepMethod;
    args: number[];
};

/**
 * How the pitch step is derived from the envelope range, differs per generator type:
 *
 * - "cents"        : oscillator type generators, step is based on the current frequency
 *                    (step = org + org / 1200, as 1200 cents == one octave)
 * - "playbackRate" : sample type generators, step is a fraction of the maximum range
 *                    (step = range / 24, inverted when range is negative)
 */
export type PitchStepMode = "cents" | "playbackRate";

export type PitchEnvelopeAuditInput = {
    waveform: string;       // oscillator waveform label, e.g. a value of OscillatorTypes
    isSample: boolean;      // whether the generator is a sample (AudioBufferSourceNode) or an oscillator
    currentValue: number;   // the generator's current frequency (oscillator) or playbackRate (sample) value
    range: number;          // pitch envelope range (-24 to +24)
    attack: number;         // envelope attack in seconds
    decay: number;          // envelope decay in seconds
    sustain: number;        // envelope sustain level (0 to 1 factor)
    release: number;        // envelope release in seconds
    org?: number;           // optional previously memorized org value (as stored on PITCH.org by a prior noteOn)
    startTime?: number;     // optional noteOn time in seconds, defaults to 0
    releaseStartTime?: number; // optional noteOff time in seconds, defaults to startTime
};

export type EnvelopePoint = {
    time: number;
    value: number;
};

export type PitchReleaseAudit = {
    applies: boolean;       // whether a release ramp back to the org value would be scheduled
    reason: string;         // human readable explanation, especially relevant when applies is false
    end: EnvelopePoint | null; // release end time and the value ramped back to (the org value)
};

export type PitchEnvelopeAudit = {
    applies: boolean;       // whether the pitch envelope would be applied at all (false when range is 0)
    reason: string;         // human readable explanation for the above
    waveform: string;
    generatorType: "sample" | "oscillator";
    targetParam: "playbackRate" | "frequency"; // the AudioParam the envelope would be scheduled on
    stepMode: PitchStepMode;                   // how the range is converted into a pitch step
    stepModeDescription: string;               // human readable description of the step conversion
    startValue: number | null; // the value the envelope is anchored at (memorized as org)
    attackEnd: EnvelopePoint | null;
    decayEnd: EnvelopePoint | null;
    release: PitchReleaseAudit;
    steps: EnvelopeScheduleStep[]; // all scheduled invocations (envelope first, release last) in order
};

/**
 * Audit the pitch envelope scheduling for a single noteOn/noteOff cycle.
 * Pure function: the same input always yields the same output and nothing is mutated.
 */
export const auditPitchEnvelope = ( input: PitchEnvelopeAuditInput ): PitchEnvelopeAudit => {
    const {
        waveform, isSample, currentValue,
        range, attack, decay, sustain, release,
        org, startTime = 0, releaseStartTime,
    } = input;

    const generatorType = isSample ? "sample" : "oscillator";
    const targetParam   = isSample ? "playbackRate" : "frequency";
    const stepMode: PitchStepMode = isSample ? "playbackRate" : "cents";
    const stepModeDescription = isSample
        ? `sample generator: step = range / ${MAX_PITCH_ENVELOPE_VALUE} of the playback rate (inverted for negative range), scaled by range / ${MAX_PITCH_ENVELOPE_VALUE}`
        : `oscillator generator: step = org + org / ${CENTS_PER_OCTAVE} (${CENTS_PER_OCTAVE} cents == one octave), scaled by range / ${MAX_PITCH_ENVELOPE_VALUE}`;

    const steps: EnvelopeScheduleStep[] = [];

    const releaseAudit: PitchReleaseAudit = {
        applies : false,
        reason  : "",
        end     : null,
    };

    const audit: PitchEnvelopeAudit = {
        applies : false,
        reason  : "",
        waveform,
        generatorType,
        targetParam,
        stepMode,
        stepModeDescription,
        startValue : null,
        attackEnd  : null,
        decayEnd   : null,
        release    : releaseAudit,
        steps,
    };

    // mirror applyPitchEnvelope(): no pitch envelope is applied when no deviating range was defined

    if ( range === 0 ) {
        audit.reason = "pitch envelope range is 0, no envelope is applied";
        releaseAudit.reason = "pitch envelope range is 0, no release is scheduled";
        return audit;
    }
    audit.applies = true;
    audit.reason  = "pitch envelope range is non-zero, envelope is applied";

    // mirror applyPitchEnvelope(): anchor at the generator's current value (memorized as org)

    const attackEnd = startTime + attack;
    const decayEnd  = attackEnd + decay;

    const orgValue = currentValue;
    audit.startValue = orgValue;

    let step: number;
    if ( isSample ) {
        step = range / MAX_PITCH_ENVELOPE_VALUE;
    } else {
        step = orgValue + ( orgValue / CENTS_PER_OCTAVE ); // 1200 cents == octave
    }
    if ( isSample && range < 0 ) {
        step = -step; // inverse direction
    }
    const shifted = step * ( range / MAX_PITCH_ENVELOPE_VALUE );

    audit.attackEnd = { time: attackEnd, value: orgValue + shifted };
    audit.decayEnd  = { time: decayEnd,  value: orgValue + ( shifted * sustain ) };

    steps.push({ method: "cancelScheduledValues", args: [ startTime ] });
    steps.push({ method: "setValueAtTime", args: [ orgValue, startTime ] });
    steps.push({ method: "linearRampToValueAtTime", args: [ orgValue + shifted, attackEnd ] });
    steps.push({ method: "linearRampToValueAtTime", args: [ orgValue + ( shifted * sustain ), decayEnd ] });

    // mirror applyPitchRelease(): ramp back to the memorized org value, when available

    if ( typeof org !== "number" ) {
        releaseAudit.reason = "no org value available (no prior pitch envelope was applied), no release is scheduled";
    } else {
        const releaseStart = typeof releaseStartTime === "number" ? releaseStartTime : startTime;
        const releaseEnd   = releaseStart + release;

        releaseAudit.applies = true;
        releaseAudit.reason  = "org value available, release ramps back to the original value";
        releaseAudit.end     = { time: releaseEnd, value: org };

        steps.push({ method: "cancelScheduledValues", args: [ releaseStart ] });
        steps.push({ method: "setValueAtTime", args: [ currentValue, releaseStart ] });
        steps.push({ method: "linearRampToValueAtTime", args: [ org, releaseEnd ] });
    }
    return audit;
};
