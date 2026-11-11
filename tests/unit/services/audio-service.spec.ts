import { describe, it, expect, beforeEach, vi } from "vitest";

// GainNode is not available in jsdom, module-router uses it for instanceof checks
( globalThis as any ).GainNode = class GainNode {};

import Config from "@/config";
import OscillatorTypes from "@/definitions/oscillator-types";
import EventFactory from "@/model/factories/event-factory";
import InstrumentFactory from "@/model/factories/instrument-factory";
import { ACTION_NOTE_ON } from "@/model/types/audio-event";
import type { Instrument } from "@/model/types/instrument";
import { prepareEnvironment, noteOn, getAvailableVoiceCount } from "@/services/audio-service";

// mock the module factory as we are only interested in the voice pool mechanics,
// not in the actual audio module (filter/delay/eq/overdrive) implementations

vi.mock( "@/model/factories/module-factory", () => {
    const createNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    return {
        default: {
            createOverdrive: () => ({ overdrive: createNode(), overdriveEnabled: false }),
            createEQ       : () => ({
                lowBand: createNode(), midBand: createNode(), highBand: createNode(),
                lowGain: createNode(), midGain: createNode(), highGain: createNode(),
                output: createNode(), eqEnabled: false,
            }),
            createFilter   : () => ({ filter: createNode(), filterEnabled: false }),
            createDelay    : () => ({
                delay: { input: createNode(), output: createNode() },
                output: createNode(), delayEnabled: false,
            }),
            applyConfiguration: vi.fn(),
        }
    };
});

/* mock Web Audio environment */

const createMockParam = ( value = 0 ) => ({
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
});

const createMockNode = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
});

const createdOscillators: any[] = [];

const createMockAudioContext = (): BaseAudioContext => ({
    sampleRate  : 44100,
    currentTime : 0,
    destination : createMockNode(),
    createGain  : () => ({ ...createMockNode(), gain: createMockParam( 1 ) }),
    // deprecated method used when the environment is not standards based (e.g. jsdom in tests)
    createGainNode: () => ({ ...createMockNode(), gain: createMockParam( 1 ) }),
    createBiquadFilter: () => ({
        ...createMockNode(),
        frequency: createMockParam(),
        gain: createMockParam(),
        Q: createMockParam(),
        type: "highpass",
    }),
    createDynamicsCompressor: () => createMockNode(),
    createAnalyser: () => createMockNode(),
    createStereoPanner: () => ({ ...createMockNode(), pan: createMockParam() }),
    createPeriodicWave: () => ({}),
    createBuffer: ( channels: number, length: number ) => ({
        getChannelData: () => new Float32Array( length * channels ),
    }),
    createOscillator: () => {
        const oscillator = {
            ...createMockNode(),
            frequency: createMockParam(),
            detune: createMockParam(),
            type: "",
            setPeriodicWave: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            noteOn: vi.fn(),
            noteOff: vi.fn(),
            onended: null as null | (() => void),
        };
        createdOscillators.push( oscillator );
        return oscillator;
    },
    createBufferSource: () => ({
        ...createMockNode(),
        playbackRate: createMockParam( 1 ),
        buffer: null as null | AudioBuffer,
        loop: false,
        start: vi.fn(),
        stop: vi.fn(),
        noteOn: vi.fn(),
        noteOff: vi.fn(),
        onended: null as null | (() => void),
    }),
} as unknown as BaseAudioContext );

// minimal WaveTable set for the non-sample oscillator types

const MOCK_WAVE_TABLES = {
    [ OscillatorTypes.SINE ]:     { real: [ 0, 1 ], imag: [ 0, 1 ] },
    [ OscillatorTypes.SAW ]:      { real: [ 0, 1 ], imag: [ 0, 1 ] },
    [ OscillatorTypes.TRIANGLE ]: { real: [ 0, 1 ], imag: [ 0, 1 ] },
    [ OscillatorTypes.SQUARE ]:   { real: [ 0, 1 ], imag: [ 0, 1 ] },
};

const VOICES_PER_OSCILLATOR = Config.INSTRUMENT_AMOUNT * 2; // mirrors createModules() pooling

describe( "audio-service voice pool observability", () => {

    let instrument: Instrument;

    beforeEach(() => {
        createdOscillators.length = 0;
        prepareEnvironment( createMockAudioContext(), MOCK_WAVE_TABLES as never );
        instrument = InstrumentFactory.create( 0 ); // single enabled TRIANGLE oscillator
    });

    const triggerNoteOn = () => {
        const event = EventFactory.create( 0, "C", 3, ACTION_NOTE_ON );
        noteOn( event, instrument, new Map(), 0 );
        return event;
    };

    it( "should report the full voice pool for each oscillator after preparing the environment", () => {
        expect( getAvailableVoiceCount( 0 ) ).toEqual([
            VOICES_PER_OSCILLATOR, VOICES_PER_OSCILLATOR, VOICES_PER_OSCILLATOR
        ]);
    });

    it( "should return an empty list for an unknown instrument index", () => {
        expect( getAvailableVoiceCount( 999 )).toEqual([]);
    });

    it( "should decrease the available voice count for the used oscillator only upon noteOn", () => {
        triggerNoteOn();

        expect( getAvailableVoiceCount( 0 ) ).toEqual([
            VOICES_PER_OSCILLATOR - 1, VOICES_PER_OSCILLATOR, VOICES_PER_OSCILLATOR
        ]);
    });

    it( "should restore the available voice count when the voice is returned to the pool on playback end", () => {
        triggerNoteOn();
        expect( getAvailableVoiceCount( 0 )[ 0 ] ).toBe( VOICES_PER_OSCILLATOR - 1 );

        // simulate the generator finishing playback
        const generator = createdOscillators[ 0 ];
        expect( typeof generator.onended ).toBe( "function" );
        generator.onended();

        expect( getAvailableVoiceCount( 0 ) ).toEqual([
            VOICES_PER_OSCILLATOR, VOICES_PER_OSCILLATOR, VOICES_PER_OSCILLATOR
        ]);
    });

    it( "should keep the count at 0 and skip the oscillator when the pool is exhausted", () => {
        const consoleSpy = vi.spyOn( console, "info" ).mockImplementation(() => {});

        // exhaust the pool for the enabled oscillator
        for ( let i = 0; i < VOICES_PER_OSCILLATOR; ++i ) {
            triggerNoteOn();
        }
        expect( getAvailableVoiceCount( 0 )[ 0 ] ).toBe( 0 );

        // this noteOn cannot retrieve a voice for oscillator 0 and is skipped
        triggerNoteOn();

        expect( consoleSpy ).toHaveBeenCalledWith(
            expect.stringContaining( "no more nodes in the pool for oscillator 0" )
        );
        // the count reflects that nothing changed
        expect( getAvailableVoiceCount( 0 ) ).toEqual([ 0, VOICES_PER_OSCILLATOR, VOICES_PER_OSCILLATOR ]);

        consoleSpy.mockRestore();
    });
});
