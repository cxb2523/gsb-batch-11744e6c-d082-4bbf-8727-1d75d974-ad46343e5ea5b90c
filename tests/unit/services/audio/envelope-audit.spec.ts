import { describe, it, expect } from "vitest";
import OscillatorTypes from "@/definitions/oscillator-types";
import {
    auditPitchEnvelope,
    MAX_PITCH_ENVELOPE_VALUE,
    type PitchEnvelopeAuditInput,
} from "@/services/audio/envelope-audit";

describe( "envelope-audit", () => {

    const createInput = ( props?: Partial<PitchEnvelopeAuditInput> ): PitchEnvelopeAuditInput => ({
        waveform     : OscillatorTypes.SAW,
        isSample     : false,
        currentValue : 440,
        range        : 12,
        attack       : 0.5,
        decay        : 0.25,
        sustain      : 0.75,
        release      : 0.1,
        startTime    : 2,
        ...props
    });

    describe( "oscillator type generators (range !== 0)", () => {
        it( "should mark the envelope as applied and expose the oscillator step conversion", () => {
            const audit = auditPitchEnvelope( createInput() );

            expect( audit.applies ).toBe( true );
            expect( audit.generatorType ).toBe( "oscillator" );
            expect( audit.targetParam ).toBe( "frequency" );
            expect( audit.stepMode ).toBe( "cents" );
            expect( audit.stepModeDescription ).toContain( "1200" );
        });

        it( "should anchor the envelope at the generator current frequency", () => {
            const audit = auditPitchEnvelope( createInput({ currentValue: 220 }) );

            expect( audit.startValue ).toBe( 220 );
            expect( audit.steps ).toContainEqual({ method: "setValueAtTime", args: [ 220, 2 ] });
        });

        it( "should calculate the attack and decay targets using the cents-per-octave formula", () => {
            const startTime = 2;
            const orgValue  = 440;
            const audit = auditPitchEnvelope( createInput({ currentValue: orgValue, startTime }) );

            // mirrors applyPitchEnvelope() in adsr-module.ts
            const step    = orgValue + ( orgValue / 1200 ); // 1200 cents == octave
            const shifted = step * ( 12 / MAX_PITCH_ENVELOPE_VALUE );

            const attackEnd = startTime + 0.5;
            const decayEnd  = attackEnd + 0.25;

            expect( audit.attackEnd ).toEqual({ time: attackEnd, value: orgValue + shifted });
            expect( audit.decayEnd ).toEqual({ time: decayEnd, value: orgValue + ( shifted * 0.75 ) });

            expect( audit.steps ).toEqual([
                { method: "cancelScheduledValues", args: [ startTime ] },
                { method: "setValueAtTime", args: [ orgValue, startTime ] },
                { method: "linearRampToValueAtTime", args: [ orgValue + shifted, attackEnd ] },
                { method: "linearRampToValueAtTime", args: [ orgValue + ( shifted * 0.75 ), decayEnd ] },
            ]);
        });

        it( "should schedule a release ramp back to the org value when an org value is provided", () => {
            const org = 440;
            const audit = auditPitchEnvelope( createInput({ org, releaseStartTime: 5 }) );

            expect( audit.release.applies ).toBe( true );
            expect( audit.release.end ).toEqual({ time: 5 + 0.1, value: org });

            const releaseSteps = audit.steps.slice( 4 );
            expect( releaseSteps ).toEqual([
                { method: "cancelScheduledValues", args: [ 5 ] },
                { method: "setValueAtTime", args: [ 440, 5 ] },
                { method: "linearRampToValueAtTime", args: [ org, 5.1 ] },
            ]);
        });
    });

    describe( "sample type generators (range !== 0)", () => {
        it( "should expose the playback rate step conversion", () => {
            const audit = auditPitchEnvelope( createInput({
                waveform     : OscillatorTypes.SAMPLE,
                isSample     : true,
                currentValue : 1,
            }));

            expect( audit.applies ).toBe( true );
            expect( audit.generatorType ).toBe( "sample" );
            expect( audit.targetParam ).toBe( "playbackRate" );
            expect( audit.stepMode ).toBe( "playbackRate" );
            expect( audit.stepModeDescription ).toContain( "playback rate" );
        });

        it( "should calculate the attack and decay targets using the playback rate fraction formula", () => {
            const startTime = 2;
            const orgValue  = 1; // playbackRate
            const audit = auditPitchEnvelope( createInput({
                isSample     : true,
                currentValue : orgValue,
                range        : 24,
                startTime,
            }));

            // mirrors applyPitchEnvelope() in adsr-module.ts
            const step    = 24 / MAX_PITCH_ENVELOPE_VALUE;
            const shifted = step * ( 24 / MAX_PITCH_ENVELOPE_VALUE );

            const attackEnd = startTime + 0.5;
            const decayEnd  = attackEnd + 0.25;

            expect( audit.startValue ).toBe( orgValue );
            expect( audit.attackEnd ).toEqual({ time: attackEnd, value: orgValue + shifted });
            expect( audit.decayEnd ).toEqual({ time: decayEnd, value: orgValue + ( shifted * 0.75 ) });

            expect( audit.steps ).toEqual([
                { method: "cancelScheduledValues", args: [ startTime ] },
                { method: "setValueAtTime", args: [ orgValue, startTime ] },
                { method: "linearRampToValueAtTime", args: [ orgValue + shifted, attackEnd ] },
                { method: "linearRampToValueAtTime", args: [ orgValue + ( shifted * 0.75 ), decayEnd ] },
            ]);
        });

        it( "should invert the step direction for a negative range on sample generators", () => {
            const orgValue = 1;
            const audit = auditPitchEnvelope( createInput({
                isSample     : true,
                currentValue : orgValue,
                range        : -12,
            }));

            // mirrors applyPitchEnvelope(): step is inverted for negative ranges
            let step = -12 / MAX_PITCH_ENVELOPE_VALUE;
            step = -step;
            const shifted = step * ( -12 / MAX_PITCH_ENVELOPE_VALUE );

            expect( audit.attackEnd?.value ).toBeCloseTo( orgValue + shifted, 10 );
            expect( audit.decayEnd?.value ).toBeCloseTo( orgValue + ( shifted * 0.75 ), 10 );
        });
    });

    describe( "when range is 0", () => {
        it( "should mark the envelope as not applied and return no scheduling steps", () => {
            const audit = auditPitchEnvelope( createInput({ range: 0, org: 440 }) );

            expect( audit.applies ).toBe( false );
            expect( audit.reason ).toContain( "range is 0" );
            expect( audit.steps ).toEqual([]);
            expect( audit.startValue ).toBeNull();
            expect( audit.attackEnd ).toBeNull();
            expect( audit.decayEnd ).toBeNull();
        });

        it( "should not schedule a release even when an org value is available", () => {
            const audit = auditPitchEnvelope( createInput({ range: 0, org: 440 }) );

            expect( audit.release.applies ).toBe( false );
            expect( audit.release.reason ).toContain( "range is 0" );
            expect( audit.release.end ).toBeNull();
        });
    });

    describe( "when no org value is available at release", () => {
        it( "should not produce release steps while still scheduling the envelope", () => {
            const audit = auditPitchEnvelope( createInput({ org: undefined }) );

            expect( audit.applies ).toBe( true );
            expect( audit.release.applies ).toBe( false );
            expect( audit.release.reason ).toContain( "no org value" );
            expect( audit.release.end ).toBeNull();

            // only the envelope steps, no release steps
            expect( audit.steps ).toHaveLength( 4 );
            expect( audit.steps.some( step => step.args.includes( 5.1 ))).toBe( false );
        });
    });
});
