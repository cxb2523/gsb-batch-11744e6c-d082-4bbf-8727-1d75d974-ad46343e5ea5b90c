/** Rendering quality reacts slowly to sustained frame time, never individual
 * loading spikes. Physics/animation time and gameplay rules remain unchanged. */
export class AdaptiveQuality {
  private elapsed = 0;
  private samples: number[] = [];
  private stable = 0;
  private slowStreak = 0;
  constructor(public ratio: number, readonly maximum = 1.5, readonly minimum = .75) {}
  update(dt: number): number | undefined {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if(dt>.15) {
      // An isolated resume/loading stall is not a device budget. Sustained
      // slow rendering still needs to lower resolution instead of being ignored.
      if(++this.slowStreak<3) return;
      dt=Math.min(dt,.5);
    } else this.slowStreak=0;
    this.elapsed += dt;
    this.samples.push(dt);
    if (this.elapsed < 4) return;
    const average = this.samples.reduce((a,b) => a+b,0)/this.samples.length;
    this.elapsed = 0; this.samples = [];
    let next = this.ratio;
    if (average > .028) { next = Math.max(this.minimum,this.ratio-.2);this.stable=0; }
    else if (average < .019) {
      this.stable += 4;
      if (this.stable >= 16) { next = Math.min(this.maximum,this.ratio+.1);this.stable=0; }
    } else this.stable=0;
    if (Math.abs(next-this.ratio) < .001) return;
    this.ratio = Math.round(next*100)/100;
    return this.ratio;
  }
}
