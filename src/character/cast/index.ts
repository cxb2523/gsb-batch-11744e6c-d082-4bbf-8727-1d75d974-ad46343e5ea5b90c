import type { HumanoidId, HumanoidSpec } from '../humanoid';
import { player } from './player';
import { wick } from './wick';
import { marlo } from './marlo';
import { pim } from './pim';
import { bram } from './bram';
import { sprout } from './sprout';
import { sol } from './sol';
import { otto } from './otto';
import { ike } from './ike';

export const SPECS: Record<HumanoidId, HumanoidSpec> = { player, wick, marlo, pim, bram, sprout, sol, otto, ike };
